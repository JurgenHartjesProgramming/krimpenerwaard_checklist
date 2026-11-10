/**
 * Convert the stakeholder Word document ("Stakeholders bij gebiedsontwikkeling voor woningbouw")
 * into an SQL script that adds every source link as documentation to the matching stakeholders.
 *
 * Usage (reads stakeholder names from DATABASE_URL, read-only):
 *   npx tsx scripts/docx-links-to-sql.ts "<file.docx>" [output.sql] [project name]
 *
 * Expected document structure:
 *   - "Heading 2" paragraphs like "1.1 Gemeente" start a stakeholder section;
 *   - inside a section, hyperlinks (normally under "Bronnen") are its sources. The link title is the
 *     paragraph text before the hyperlink, e.g. "IPLO – Omgevingsplan".
 *   - Sections after the "Analyse conflicten" heading are ignored.
 *
 * Matching: heading names are compared loosely (case, "/", "en", punctuation ignored), so
 * "Financiers beleggers" matches "Financiers en beleggers". A stakeholder that appears in several
 * phases gets the links in every phase. Links whose URL the stakeholder already has are skipped,
 * which also makes the script safe to run twice.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";
import postgres from "postgres";

interface Source {
  title: string;
  url: string;
}
interface Section {
  heading: string;
  name: string;
  sources: Source[];
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const runText = (xml: string) =>
  (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? []).map((t) => decode(t.replace(/<[^>]+>/g, ""))).join("");

async function readSections(path: string): Promise<Section[]> {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const doc = await zip.file("word/document.xml")!.async("string");
  const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1];
    const target = m[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) targets.set(id, decode(target));
  }

  const sections: Section[] = [];
  let current: Section | null = null;
  let stopped = false;
  for (const p of doc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    if (stopped) break;
    const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
    const text = runText(p).trim();
    if (/^Heading1$|^Kop1$/i.test(style) && /conflict/i.test(text)) {
      stopped = true;
      continue;
    }
    if (/^Heading2$|^Kop2$/i.test(style)) {
      const m = text.match(/^\d+\.\d+\s+(.+)$/);
      current = m ? { heading: text, name: m[1].trim(), sources: [] } : null;
      if (current) sections.push(current);
      continue;
    }
    if (!current) continue;
    // Hyperlinks in this paragraph; the title is the text before the first link.
    const links = [...p.matchAll(/<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>/g)];
    if (links.length === 0) continue;
    const beforeFirst = runText(p.slice(0, links[0].index));
    for (const l of links) {
      const rid = l[1].match(/r:id="([^"]+)"/)?.[1];
      const url = rid ? targets.get(rid) : undefined;
      if (!url || !/^https?:\/\//i.test(url)) continue;
      const linkText = runText(l[2]).trim();
      const title = (links.length === 1 ? beforeFirst : "").replace(/[\s:–-]+$/, "").trim() || linkText || url;
      if (!current.sources.some((s) => s.url === url)) current.sources.push({ title, url });
    }
  }
  return sections;
}

/** Loose name key: lowercase, no punctuation, no "/" or the word "en". */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[/,()–-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w !== "en")
    .join(" ");

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const iso = (col: string) =>
  `CASE WHEN ${col} IS NULL THEN NULL ELSE to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END`;

async function main() {
  const [path, output = "imports/stakeholder-bronnen.sql", projectName = "Sjabloon – Stakeholders per fase"] =
    process.argv.slice(2);
  if (!path) {
    console.error('Usage: npx tsx scripts/docx-links-to-sql.ts "<file.docx>" [output.sql] [project name]');
    process.exit(1);
  }
  const source = path.split(/[\\/]/).pop()!;
  const sections = await readSections(path);

  const db = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = await db`
    select distinct s.name
    from stakeholders s
    join phases f on f.id = s.phase_id and f.deleted_at is null
    join projects p on p.id = s.project_id and p.deleted_at is null
    where p.name = ${projectName} and s.deleted_at is null`;
  await db.end();
  if (rows.length === 0) throw new Error(`Project "${projectName}" not found or has no stakeholders.`);
  const byKey = new Map<string, string>(rows.map((r) => [norm(r.name as string), r.name as string]));

  const values: string[] = [];
  const matched: string[] = [];
  const unmatched: Section[] = [];
  const noSources: string[] = [];
  let order = 0;
  for (const sec of sections) {
    if (sec.sources.length === 0) {
      noSources.push(sec.heading);
      continue;
    }
    const name = byKey.get(norm(sec.name));
    if (!name) {
      unmatched.push(sec);
      continue;
    }
    matched.push(name === sec.name ? sec.name : `${sec.name} → ${name}`);
    for (const s of sec.sources) {
      values.push(`  (${q(name)}, ${q(s.title)}, ${q(s.url)}, ${q(`Bron uit ${source} (${sec.heading})`)}, ${order++})`);
    }
  }
  if (values.length === 0) throw new Error("No links matched any stakeholder.");

  const note = q(`Bronnen toegevoegd uit Word: ${source}`);
  const sql = `-- Stakeholder sources from: ${source}
-- Generated by scripts/docx-links-to-sql.ts on ${new Date().toISOString()}
-- Adds documentation links to stakeholders in project "${projectName}" (every phase they occur in).
-- Links a stakeholder already has (same URL) are skipped, so running this twice adds nothing new.

BEGIN;

CREATE TEMP TABLE link_import (stakeholder_name text, title text, url text, description text, sort int) ON COMMIT DROP;
INSERT INTO link_import (stakeholder_name, title, url, description, sort) VALUES
${values.join(",\n")};

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM projects WHERE name = ${q(projectName)} AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Project "%" niet gevonden. Er is niets toegevoegd.', ${q(projectName)};
  END IF;
END $$;

WITH ctx AS (
  SELECT gen_random_uuid() AS batch_id,
         (SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at LIMIT 1) AS actor_id
),
ins AS (
  INSERT INTO doc_links (project_id, stakeholder_id, title, url, description, created_by, created_at, updated_at)
  SELECT s.project_id, s.id, li.title, li.url, li.description, ctx.actor_id,
         now() + li.sort * interval '1 millisecond', now() + li.sort * interval '1 millisecond'
  FROM link_import li
  CROSS JOIN ctx
  JOIN projects p ON p.name = ${q(projectName)} AND p.deleted_at IS NULL
  JOIN stakeholders s ON s.project_id = p.id AND s.name = li.stakeholder_name AND s.deleted_at IS NULL
  JOIN phases f ON f.id = s.phase_id AND f.deleted_at IS NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM doc_links d WHERE d.stakeholder_id = s.id AND d.url = li.url AND d.deleted_at IS NULL
  )
  RETURNING *
)
-- Version history: one "create" event per link, all in one batch.
INSERT INTO history_events (project_id, entity_type, entity_id, op, before, after, actor_id, batch_id, note)
SELECT ins.project_id, 'doc_link', ins.id, 'create', NULL,
       jsonb_build_object(
         'id', ins.id, 'projectId', ins.project_id, 'stakeholderId', ins.stakeholder_id, 'title', ins.title,
         'url', ins.url, 'description', ins.description, 'createdBy', ins.created_by, 'version', ins.version,
         'deletedAt', NULL, 'createdAt', ${iso("ins.created_at")}, 'updatedAt', ${iso("ins.updated_at")}),
       ctx.actor_id, ctx.batch_id, ${note}
FROM ins CROSS JOIN ctx
ORDER BY ins.created_at;

COMMIT;
`;
  writeFileSync(output, sql, "utf8");

  const total = sections.reduce((n, s) => n + s.sources.length, 0);
  console.log(`${sections.length} stakeholderkopjes, ${total} bronlinks gevonden.`);
  console.log(`${matched.length} kopjes gekoppeld, ${values.length} links in de SQL.`);
  const fuzzy = matched.filter((m) => m.includes("→"));
  if (fuzzy.length) console.log(`\nGekoppeld met kleine naamverschillen:\n  ${fuzzy.join("\n  ")}`);
  if (unmatched.length) {
    console.log(`\nNiet gekoppeld (komt niet voor in het sjabloon):`);
    for (const u of unmatched) console.log(`  ${u.heading} (${u.sources.length} links)`);
  }
  if (noSources.length) console.log(`\nKopjes zonder links: ${noSources.join("; ")}`);
  console.log(`\nSQL geschreven naar ${output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
