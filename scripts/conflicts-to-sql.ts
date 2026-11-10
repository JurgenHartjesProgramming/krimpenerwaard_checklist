/**
 * Convert the "Belangenverstrengeling per fase" Excel into an SQL script that appends each
 * conflict to the "Belangen en eisen" (interests) of the matching stakeholders.
 *
 * Usage (reads stakeholder names from DATABASE_URL, read-only):
 *   npx tsx scripts/conflicts-to-sql.ts "<file.xlsx>" [output.sql] [project name]
 *
 * Input: worksheet "Belangen per deelfase" with columns
 *   A Fase | B Nr. deelfase | C Deelfase | D Conflict nr. | E Thema | F Belangenconflict | G Ernst |
 *   H Betrokken belangen – kant A | I Betrokken belangen – kant B | J Waarom | K Oplossingsrichtingen | …
 *   Parties in H and I are separated by ";".
 *
 * Target: the stakeholders of the activity with the conflict's deelfase number (e.g. 1.2). For projects
 * from before activities existed, all stakeholders of the phase are used instead.
 *
 * Matching a party to a stakeholder of that activity (or phase):
 *   1. exact name;
 *   2. a known alias (ALIASES below);
 *   3. the name without its "(…)" qualifier, e.g. "Gemeente (ruimtelijk)" → "Gemeente".
 * Parties that still don't match are reported and skipped; the conflict is then only added to the
 * stakeholders of the other side. A conflict that occurs in several deelfases of one phase is added
 * once per stakeholder, listing all those deelfases.
 *
 * The SQL updates the stakeholders and writes "update" events to history_events, so the change is
 * visible in the timeline and can be reverted. It refuses to run twice (marker check) and aborts
 * without changes when the project or a matched stakeholder no longer exists.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import postgres from "postgres";
import { q, snapshot } from "./lib/sql";

/** Party names in the conflicts sheet that are spelled differently in the template (first match wins). */
const ALIASES: Record<string, string[]> = {
  "Woningcorporaties, WSW en Aw": ["Woningcorporaties, WSW en Autoriteit woningcorporaties", "Woningcorporaties"],
  "Woningcorporaties (verhuur)": ["Woningcorporaties"],
};

const SEVERITY_ORDER: Record<string, number> = { Hoog: 0, Middel: 1, Laag: 2 };

interface ConflictRow {
  phase: string;
  stepNr: string;
  stepTitle: string;
  nr: number;
  theme: string;
  title: string;
  severity: string;
  sideA: string[];
  sideB: string[];
  why: string;
  solutions: string;
}

function text(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return String(v.result ?? "");
  }
  return String(v);
}

const parties = (s: string) =>
  s
    .split(/;|\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

async function readConflicts(path: string): Promise<ConflictRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet("Belangen per deelfase");
  if (!ws) throw new Error('Worksheet "Belangen per deelfase" not found.');
  const rows: ConflictRow[] = [];
  ws.eachRow((row, r) => {
    if (r === 1) return;
    const c = (i: number) => text(row.getCell(i).value).trim();
    if (!c(1)) return;
    rows.push({
      phase: c(1).replace(/^Fase\s+\d+\s*[–-]\s*/, "").trim(),
      stepNr: c(2),
      stepTitle: c(3),
      nr: Number(c(4)),
      theme: c(5),
      title: c(6),
      severity: c(7),
      sideA: parties(c(8)),
      sideB: parties(c(9)),
      why: c(10),
      solutions: c(11),
    });
  });
  return rows;
}

/** Resolve a party to a stakeholder name in the given phase, or null. */
function resolve(party: string, names: Set<string>): { name: string; how: string } | null {
  if (names.has(party)) return { name: party, how: "exact" };
  for (const alias of ALIASES[party] ?? []) {
    if (names.has(alias)) return { name: alias, how: `alias → ${alias}` };
  }
  const base = party.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (base !== party && names.has(base)) return { name: base, how: `zonder toevoeging → ${base}` };
  return null;
}

interface Entry {
  conflict: ConflictRow;
  steps: Map<string, string>;
  sides: Set<"A" | "B">;
}

function block(entries: Entry[], source: string): string {
  const sorted = [...entries].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.conflict.severity] ?? 9) - (SEVERITY_ORDER[b.conflict.severity] ?? 9) || a.conflict.nr - b.conflict.nr,
  );
  const parts = sorted.map(({ conflict: c, steps, sides }) => {
    const stepList = [...steps].map(([nr, title]) => `${nr} ${title}`).join("; ");
    return [
      `Conflict ${c.nr}: ${c.title}`,
      `Ernst: ${c.severity} · Thema: ${c.theme} · Deelfase: ${stepList}`,
      `Deze stakeholder staat aan kant ${[...sides].sort().join(" en ")}.`,
      `Kant A: ${c.sideA.join("; ")}`,
      `Kant B: ${c.sideB.join("; ")}`,
      `Waarom: ${c.why}`,
      c.solutions ? `Oplossingsrichtingen:\n${c.solutions}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [`${marker(source)} – ${entries.length} conflict${entries.length === 1 ? "" : "en"}`, ...parts].join("\n\n");
}

const marker = (source: string) => `BELANGENCONFLICTEN (bron: ${source})`;
async function main() {
  const [path, output = "imports/belangenconflicten.sql", projectName = "Sjabloon – Stakeholders per fase"] =
    process.argv.slice(2);
  if (!path) {
    console.error('Usage: npx tsx scripts/conflicts-to-sql.ts "<file.xlsx>" [output.sql] [project name]');
    process.exit(1);
  }
  const source = path.split(/[\\/]/).pop()!;
  const conflicts = await readConflicts(path);

  // Read the target project's stakeholder names per phase (read-only).
  const db = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = await db`
    select f.name as phase, coalesce(a.number, '') as nr, s.name
    from stakeholders s
    join phases f on f.id = s.phase_id and f.deleted_at is null
    join projects p on p.id = s.project_id and p.deleted_at is null
    left join activities a on a.id = s.activity_id and a.deleted_at is null
    where p.name = ${projectName} and s.deleted_at is null`;
  await db.end();
  if (rows.length === 0) throw new Error(`Project "${projectName}" not found or has no stakeholders.`);
  // With activities, a conflict goes to the stakeholders of the matching activity (deelfase nr);
  // projects from before activities fall back to all stakeholders of the phase.
  const byActivity = rows.some((r) => r.nr);
  const keyOf = (phase: string, nr: string) => (byActivity ? `${phase}|${nr}` : phase);
  const namesByKey = new Map<string, Set<string>>();
  for (const r of rows) {
    if (byActivity && !r.nr) continue;
    const key = keyOf(r.phase, r.nr);
    if (!namesByKey.has(key)) namesByKey.set(key, new Set());
    namesByKey.get(key)!.add(r.name);
  }

  // phase → stakeholder → conflict nr → entry
  const targets = new Map<string, Map<string, Map<number, Entry>>>();
  const fuzzy = new Map<string, Set<string>>();
  const unmatched = new Map<string, Set<string>>();
  const orphanRows: ConflictRow[] = [];

  for (const c of conflicts) {
    const key = keyOf(c.phase, c.stepNr);
    const names = namesByKey.get(key);
    if (!names) {
      orphanRows.push(c);
      continue;
    }
    let matchedAny = false;
    for (const [side, list] of [
      ["A", c.sideA],
      ["B", c.sideB],
    ] as const) {
      for (const party of list) {
        const hit = resolve(party, names);
        if (!hit) {
          if (!unmatched.has(party)) unmatched.set(party, new Set());
          unmatched.get(party)!.add(c.phase);
          continue;
        }
        matchedAny = true;
        if (hit.how !== "exact") {
          if (!fuzzy.has(party)) fuzzy.set(party, new Set());
          fuzzy.get(party)!.add(hit.how);
        }
        if (!targets.has(key)) targets.set(key, new Map());
        const perPhase = targets.get(key)!;
        if (!perPhase.has(hit.name)) perPhase.set(hit.name, new Map());
        const perStakeholder = perPhase.get(hit.name)!;
        if (!perStakeholder.has(c.nr)) perStakeholder.set(c.nr, { conflict: c, steps: new Map(), sides: new Set() });
        const e = perStakeholder.get(c.nr)!;
        e.steps.set(c.stepNr, c.stepTitle);
        e.sides.add(side);
      }
    }
    if (!matchedAny) orphanRows.push(c);
  }

  const values: string[] = [];
  for (const [key, perPhase] of targets) {
    const [phase, nr = ""] = key.split("|");
    for (const [name, perStakeholder] of perPhase) {
      values.push(`  (${q(phase)}, ${q(nr)}, ${q(name)}, ${q(block([...perStakeholder.values()], source))})`);
    }
  }

  const note = q(`Belangenconflicten toegevoegd uit Excel: ${source}`);
  const sql = `-- Belangenconflicten: ${source}
-- Generated by scripts/conflicts-to-sql.ts on ${new Date().toISOString()}
-- Appends conflicts to "Belangen en eisen" of ${values.length} stakeholders in project "${projectName}".
-- Runs in one transaction; aborts without changes if the project or a stakeholder is missing,
-- or if these conflicts were already added.

BEGIN;

CREATE TEMP TABLE conflict_import (phase_name text, activity_number text, stakeholder_name text, block text) ON COMMIT DROP;
INSERT INTO conflict_import (phase_name, activity_number, stakeholder_name, block) VALUES
${values.join(",\n")};

CREATE TEMP TABLE conflict_targets ON COMMIT DROP AS
SELECT s.id, ci.block, ${snapshot.stakeholder("s")} AS before
FROM conflict_import ci
JOIN projects p ON p.name = ${q(projectName)} AND p.deleted_at IS NULL
JOIN phases f ON f.project_id = p.id AND f.name = ci.phase_name AND f.deleted_at IS NULL
JOIN stakeholders s ON s.phase_id = f.id AND s.name = ci.stakeholder_name AND s.deleted_at IS NULL
 AND (
   (ci.activity_number = '' AND s.activity_id IS NULL)
   OR EXISTS (SELECT 1 FROM activities a WHERE a.id = s.activity_id AND a.number = ci.activity_number AND a.deleted_at IS NULL)
 );

DO $$
DECLARE expected int; found int;
BEGIN
  SELECT count(*) INTO expected FROM conflict_import;
  SELECT count(*) INTO found FROM conflict_targets;
  IF found <> expected THEN
    RAISE EXCEPTION 'Verwachtte % stakeholders, gevonden %. Is het project of een stakeholder hernoemd of verwijderd? Er is niets aangepast.', expected, found;
  END IF;
  IF EXISTS (SELECT 1 FROM stakeholders s JOIN conflict_targets t ON t.id = s.id WHERE s.interests LIKE ${q(`%${marker(source)}%`)}) THEN
    RAISE EXCEPTION 'Deze belangenconflicten zijn al toegevoegd. Er is niets aangepast.';
  END IF;
END $$;

UPDATE stakeholders s
SET interests = CASE WHEN s.interests = '' THEN t.block ELSE s.interests || E'\\n\\n' || t.block END,
    version = s.version + 1,
    updated_at = now()
FROM conflict_targets t
WHERE s.id = t.id;

-- Version history: one "update" event per stakeholder, all in one batch.
INSERT INTO history_events (project_id, entity_type, entity_id, op, before, after, actor_id, batch_id, note)
SELECT s.project_id, 'stakeholder', s.id, 'update', t.before, ${snapshot.stakeholder("s")},
       (SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at LIMIT 1),
       b.batch_id, ${note}
FROM stakeholders s
JOIN conflict_targets t ON t.id = s.id
CROSS JOIN (SELECT gen_random_uuid() AS batch_id) b
JOIN phases f ON f.id = s.phase_id
ORDER BY f.sort_order, s.sort_order;

COMMIT;
`;
  writeFileSync(output, sql, "utf8");

  // Report
  const conflictCount = new Set(conflicts.map((c) => c.nr)).size;
  console.log(`${conflicts.length} rijen (${conflictCount} unieke conflicten) gelezen.`);
  console.log(`${values.length} stakeholders krijgen conflicten toegevoegd.`);
  console.log(`\nGekoppeld via alias of zonder toevoeging:`);
  for (const [party, how] of fuzzy) console.log(`  ${party}  (${[...how].join(" / ")})`);
  console.log(`\nNiet gekoppeld (komt in die fase niet voor in het sjabloon):`);
  for (const [party, phases] of unmatched) console.log(`  ${party}  — ${[...phases].join(", ")}`);
  console.log(`\nRijen zonder enige gekoppelde stakeholder: ${orphanRows.length}`);
  console.log("Modus: " + (byActivity ? "per activiteit (deelfase-nummer)" : "per fase (project zonder activiteiten)"));
  for (const c of orphanRows) console.log(`  ${c.stepNr} conflict ${c.nr}: A=${c.sideA.join("; ")} | B=${c.sideB.join("; ")}`);
  console.log(`\nSQL geschreven naar ${output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
