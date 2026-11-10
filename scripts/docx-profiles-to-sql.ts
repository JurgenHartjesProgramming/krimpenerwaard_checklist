/**
 * Convert the stakeholder Word document ("Stakeholders bij gebiedsontwikkeling voor woningbouw") into
 * SQL that fills "Over deze stakeholder" (stakeholders.profile) for matching stakeholders.
 *
 * Usage (reads stakeholder names from DATABASE_URL, read-only):
 *   npx tsx scripts/docx-profiles-to-sql.ts "<file.docx>" [output.sql] [project name]
 *
 * For every "Heading 2" stakeholder section (e.g. "1.1 Gemeente") the whole text up to "Bronnen" is
 * taken (sources are excluded: they are stored as documentation links). Bold paragraphs become
 * sub-headings ("## …"), numbered/bulleted paragraphs list items ("• …").
 * Names are matched loosely (case, "/", "en", punctuation ignored); every stakeholder row with that name
 * in the project gets the text. Rows that already have a profile are left alone, so manual edits are
 * never overwritten and a second run changes nothing.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";
import postgres from "postgres";
import { importContext, q, snapshot } from "./lib/sql";

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const paragraphText = (xml: string) =>
  (xml.match(/<w:t[^>]*>[^<]*<\/w:t>|<w:tab\/>/g) ?? [])
    .map((t) => (t === "<w:tab/>" ? " " : decode(t.replace(/<[^>]+>/g, ""))))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

interface Section {
  heading: string;
  name: string;
  lines: string[];
}

async function readProfiles(path: string): Promise<Section[]> {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const doc = await zip.file("word/document.xml")!.async("string");
  const body = doc.split("<w:body>")[1] ?? doc;
  const blocks = body.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  const sections: Section[] = [];
  let current: Section | null = null;
  let inSources = false;

  for (const b of blocks) {
    if (b.startsWith("<w:tbl>")) {
      if (!current || inSources) continue;
      // Tables are flattened to one line per row: "cell | cell".
      for (const tr of b.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []) {
        const cells = (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map(paragraphText).filter(Boolean);
        if (cells.length) current.lines.push(`• ${cells.join(" | ")}`);
      }
      continue;
    }
    const style = b.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
    const text = paragraphText(b);
    if (/^(Heading|Kop)1$/i.test(style)) {
      current = null;
      if (/conflict|matrix/i.test(text)) break;
      continue;
    }
    if (/^(Heading|Kop)2$/i.test(style)) {
      const m = text.match(/^\d+\.\d+\s+(.+)$/);
      current = m ? { heading: text.trim(), name: m[1].trim(), lines: [] } : null;
      if (current) sections.push(current);
      inSources = false;
      continue;
    }
    if (!current || inSources) continue;
    if (!text) {
      current.lines.push("");
      continue;
    }
    const bold = /<w:b\/>|<w:b w:val="(1|true)"\/>/.test(b) && !/<w:b w:val="(0|false)"\/>/.test(b);
    if (/^bronnen:?$/i.test(text)) {
      inSources = true;
      continue;
    }
    if (bold && text.length < 120 && !/[.:]$/.test(text)) current.lines.push(`## ${text}`);
    else if (/<w:numPr>/.test(b) || /^List/i.test(style)) current.lines.push(`• ${text}`);
    else current.lines.push(text);
  }
  return sections;
}

/** Profile text: blank line before each heading, no repeated or trailing blank lines. */
function toProfile(lines: string[]): string {
  const out: string[] = [];
  for (const l of lines) {
    if (l.startsWith("## ") && out.length && out[out.length - 1] !== "") out.push("");
    if (l === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(l);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[/,()–-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w !== "en")
    .join(" ");

async function main() {
  const [path, output = "imports/stakeholder-achtergrond.sql", projectName = "Sjabloon – Stakeholders per fase"] =
    process.argv.slice(2);
  if (!path) {
    console.error('Usage: npx tsx scripts/docx-profiles-to-sql.ts "<file.docx>" [output.sql] [project name]');
    process.exit(1);
  }
  const source = path.split(/[\\/]/).pop()!;
  const sections = await readProfiles(path);

  const db = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = await db`
    select distinct s.name
    from stakeholders s
    join projects p on p.id = s.project_id and p.deleted_at is null
    where p.name = ${projectName} and s.deleted_at is null`;
  await db.end();
  if (rows.length === 0) throw new Error(`Project "${projectName}" not found or has no stakeholders.`);
  const byKey = new Map<string, string>(rows.map((r) => [norm(r.name as string), r.name as string]));

  // A stakeholder can have several sections (e.g. "1.2 Provincie" and "5.11 Provincie"): merge them.
  const byName = new Map<string, { heading: string; profile: string }[]>();
  const unmatched: string[] = [];
  const fuzzy: string[] = [];
  for (const sec of sections) {
    const profile = toProfile(sec.lines);
    if (!profile) continue;
    const name = byKey.get(norm(sec.name));
    if (!name) {
      unmatched.push(sec.heading);
      continue;
    }
    if (name !== sec.name) fuzzy.push(`${sec.name} → ${name}`);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push({ heading: sec.heading, profile });
  }
  const values: string[] = [];
  const merged: string[] = [];
  for (const [name, parts] of byName) {
    const text =
      parts.length === 1
        ? parts[0].profile
        : parts.map((p, i) => (i === 0 ? p.profile : `## Aanvullend (${p.heading})\n${p.profile}`)).join("\n\n");
    if (parts.length > 1) merged.push(`${name}: ${parts.map((p) => p.heading).join(" + ")}`);
    values.push(`  (${q(name)}, ${q(text)})`);
  }
  if (values.length === 0) throw new Error("No sections matched any stakeholder.");
  const unusedNames = [...byKey.values()].filter((n) => !sections.some((s) => byKey.get(norm(s.name)) === n));

  const note = q(`Achtergrond toegevoegd uit Word: ${source}`);
  const sql = `-- Stakeholder background ("Over deze stakeholder") from: ${source}
-- Generated by scripts/docx-profiles-to-sql.ts on ${new Date().toISOString()}
-- Fills the profile of stakeholders in project "${projectName}" whose profile is still empty.

BEGIN;

${importContext}

CREATE TEMP TABLE profile_import (stakeholder_name text, profile text) ON COMMIT DROP;
INSERT INTO profile_import VALUES
${values.join(",\n")};

CREATE TEMP TABLE profile_targets ON COMMIT DROP AS
SELECT s.id, pi.profile, ${snapshot.stakeholder("s")} AS before
FROM profile_import pi
JOIN projects p ON p.name = ${q(projectName)} AND p.deleted_at IS NULL
JOIN stakeholders s ON s.project_id = p.id AND s.name = pi.stakeholder_name AND s.deleted_at IS NULL
WHERE s.profile = '';

UPDATE stakeholders s
SET profile = t.profile, version = s.version + 1, updated_at = now()
FROM profile_targets t
WHERE s.id = t.id;

INSERT INTO history_events (project_id, entity_type, entity_id, op, before, after, actor_id, batch_id, note)
SELECT s.project_id, 'stakeholder', s.id, 'update', t.before, ${snapshot.stakeholder("s")}, c.actor_id, c.batch_id, ${note}
FROM stakeholders s JOIN profile_targets t ON t.id = s.id CROSS JOIN import_ctx c;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM profile_targets;
  RAISE NOTICE 'Achtergrond ingevuld bij % stakeholderregels.', n;
END $$;

COMMIT;
`;
  writeFileSync(output, sql, "utf8");

  console.log(`${sections.length} stakeholderkopjes gelezen, ${values.length} stakeholders gekoppeld.`);
  if (merged.length) console.log(`\nSamengevoegd (meerdere kopjes):\n  ${merged.join("\n  ")}`);
  if (fuzzy.length) console.log(`\nGekoppeld met kleine naamverschillen:\n  ${fuzzy.join("\n  ")}`);
  if (unmatched.length) console.log(`\nNiet in het project:\n  ${unmatched.join("\n  ")}`);
  if (unusedNames.length) console.log(`\nStakeholders in het project zonder kopje in het document:\n  ${unusedNames.join("\n  ")}`);
  console.log(`\nSQL geschreven naar ${output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
