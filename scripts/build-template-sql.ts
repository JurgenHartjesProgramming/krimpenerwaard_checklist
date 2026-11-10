/**
 * Build the template project "Sjabloon – Stakeholders per fase" from scratch, in ONE SQL script,
 * from the three source documents:
 *
 *   1. "Stakeholders per fase" Excel (V01)        → phases, activities, stakeholders per activity (with role)
 *   2. "Belangenverstrengeling per fase" Excel     → conflicts of interest per activity
 *   3. "Stakeholders bij gebiedsontwikkeling" Word → "Over deze stakeholder" text + source links per stakeholder
 *
 * Usage (no database access needed):
 *   npx tsx scripts/build-template-sql.ts "<V01.xlsx>" "<Belangenverstrengeling.xlsx>" "<V02.docx>" [output.sql] [project name]
 *
 * The SQL runs in one transaction, writes every row to the version history (one batch), and stops
 * without changes when a project with the same name already exists (rename or delete that one first).
 * Statuses start at "not started"; contact details, deadlines and comments are empty.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { bySeverity, readConflictSheet, type ConflictRow } from "./lib/conflict-sheet";
import { membersOf, readPhaseSheet } from "./lib/phase-sheet";
import { importContext, q, snapshot } from "./lib/sql";
import { nameKey, readStakeholderDoc, type Source } from "./lib/stakeholder-doc";

async function main() {
  const [phasePath, conflictPath, docPath, output = "imports/sjabloon-volledig.sql", projectName = "Sjabloon – Stakeholders per fase"] =
    process.argv.slice(2);
  if (!phasePath || !conflictPath || !docPath) {
    console.error(
      'Usage: npx tsx scripts/build-template-sql.ts "<V01.xlsx>" "<Belangenverstrengeling.xlsx>" "<V02.docx>" [output.sql] [project name]',
    );
    process.exit(1);
  }
  const fileName = (p: string) => p.split(/[\\/]/).pop()!;
  const phases = await readPhaseSheet(phasePath);
  const conflicts = await readConflictSheet(conflictPath);
  const sections = await readStakeholderDoc(docPath);

  // ---- Stakeholder background + sources per (loose) name; several sections per name are merged.
  const allNames = new Set(phases.flatMap((p) => p.steps.flatMap((s) => membersOf(s).map((m) => m.name))));
  const nameByKey = new Map([...allNames].map((n) => [nameKey(n), n]));
  const info = new Map<string, { parts: { heading: string; profile: string }[]; sources: Source[] }>();
  const unusedSections: string[] = [];
  const fuzzy = new Set<string>();
  for (const sec of sections) {
    const name = nameByKey.get(nameKey(sec.name));
    if (!name) {
      unusedSections.push(sec.heading);
      continue;
    }
    if (name !== sec.name) fuzzy.add(`${sec.name} → ${name}`);
    if (!info.has(name)) info.set(name, { parts: [], sources: [] });
    const i = info.get(name)!;
    if (sec.profile) i.parts.push({ heading: sec.heading, profile: sec.profile });
    for (const src of sec.sources) if (!i.sources.some((s) => s.url === src.url)) i.sources.push(src);
  }
  const profileOf = (name: string) => {
    const parts = info.get(name)?.parts ?? [];
    return parts.map((p, i) => (i === 0 ? p.profile : `## Aanvullend (${p.heading})\n${p.profile}`)).join("\n\n");
  };

  // ---- Conflicts per activity (phase name + activity number).
  const conflictsByActivity = new Map<string, ConflictRow[]>();
  for (const c of conflicts) {
    const key = `${c.phase}|${c.stepNr}`;
    if (!conflictsByActivity.has(key)) conflictsByActivity.set(key, []);
    conflictsByActivity.get(key)!.push(c);
  }

  // ---- Rows
  const projectId = randomUUID();
  const phaseRows: string[] = [];
  const activityRows: string[] = [];
  const stakeholderRows: string[] = [];
  const conflictRows: string[] = [];
  const linkRows: string[] = [];
  const usedConflictKeys = new Set<string>();
  const withoutProfile = new Set<string>();
  let seq = 0;
  const at = () => `now() + ${seq++} * interval '1 microsecond'`;

  phases.forEach((p, pi) => {
    const phaseId = randomUUID();
    phaseRows.push(`  (${q(phaseId)}, ${q(projectId)}, ${q(p.name)}, ${q(p.description)}, ${pi + 1}, ${at()})`);
    p.steps.forEach((step, si) => {
      const activityId = randomUUID();
      activityRows.push(
        `  (${q(activityId)}, ${q(projectId)}, ${q(phaseId)}, ${q(step.nr)}, ${q(step.title)}, ${q(step.check)}, ${q(step.result)}, ${si + 1}, ${at()})`,
      );
      const key = `${p.name}|${step.nr}`;
      const own = [...(conflictsByActivity.get(key) ?? [])].sort(bySeverity);
      if (own.length) usedConflictKeys.add(key);
      own.forEach((c, ci) => {
        conflictRows.push(
          `  (${q(projectId)}, ${q(activityId)}, ${c.nr ?? "NULL"}, ${q(c.title)}, ${q(c.theme)}, ${q(c.severity)}, ${q(c.sideA)}, ${q(c.sideB)}, ${q(c.why)}, ${q(c.solutions)}, ${ci + 1}, ${at()})`,
        );
      });
      membersOf(step).forEach((m, mi) => {
        const stakeholderId = randomUUID();
        const profile = profileOf(m.name);
        if (!profile) withoutProfile.add(m.name);
        stakeholderRows.push(
          `  (${q(stakeholderId)}, ${q(projectId)}, ${q(phaseId)}, ${q(activityId)}, '${m.role}', ${mi + 1}, ${q(m.name)}, ${q(profile)}, ${at()})`,
        );
        for (const src of info.get(m.name)?.sources ?? []) {
          linkRows.push(
            `  (${q(projectId)}, ${q(stakeholderId)}, ${q(src.title)}, ${q(src.url)}, ${q(`Bron uit ${fileName(docPath)}`)}, ${at()})`,
          );
        }
      });
    });
  });

  const insert = (table: string, columns: string, rows: string[]) =>
    rows.length ? `INSERT INTO ${table} (${columns}) VALUES\n${rows.join(",\n")};\n` : `-- (no rows for ${table})\n`;
  const note = q(`Sjabloon opgebouwd uit ${fileName(phasePath)}, ${fileName(conflictPath)} en ${fileName(docPath)}`);
  const history = (type: keyof typeof snapshot, table: string, projectCol = "x.project_id") =>
    `INSERT INTO history_events (project_id, entity_type, entity_id, op, before, after, actor_id, batch_id, note)
SELECT ${projectCol}, '${type}', x.id, 'create', NULL, ${snapshot[type]("x")}, c.actor_id, c.batch_id, ${note}
FROM ${table} x CROSS JOIN import_ctx c WHERE ${projectCol} = ${q(projectId)} ORDER BY x.created_at;
`;

  const sql = `-- Template project "${projectName}", built by scripts/build-template-sql.ts on ${new Date().toISOString()}
-- Sources: ${fileName(phasePath)} | ${fileName(conflictPath)} | ${fileName(docPath)}
-- ${phaseRows.length} phases, ${activityRows.length} activities, ${stakeholderRows.length} stakeholders,
-- ${conflictRows.length} conflicts, ${linkRows.length} documentation links.
-- Runs in one transaction; stops without changes when a project with this name already exists.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM projects WHERE name = ${q(projectName)} AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Project "%" bestaat al. Hernoem of verwijder het eerst; er is niets aangemaakt.', ${q(projectName)};
  END IF;
END $$;

INSERT INTO projects (id, name, description, status) VALUES (${q(projectId)}, ${q(projectName)}, ${q(
    'Sjabloon met fases, activiteiten, stakeholders, belangenconflicten en bronnen. Gebruik het als bron bij "Kopiëren uit project".',
  )}, 'active');

-- Phases
${insert("phases", "id, project_id, name, description, sort_order, created_at", phaseRows)}
-- Activities (one per step row: number, name, "Wat doe/controleer je?", result)
${insert("activities", "id, project_id, phase_id, number, name, description, result, sort_order, created_at", activityRows)}
-- Conflicts of interest per activity
${insert(
    "activity_conflicts",
    "project_id, activity_id, conflict_number, title, theme, severity, side_a, side_b, why, solutions, sort_order, created_at",
    conflictRows,
  )}
-- Stakeholders per activity ("Leidend" = lead, "Ook betrokken" = involved), with background text
${insert("stakeholders", "id, project_id, phase_id, activity_id, role, sort_order, name, profile, created_at", stakeholderRows)}
-- Source links per stakeholder
${insert("doc_links", "project_id, stakeholder_id, title, url, description, created_at", linkRows)}
UPDATE phases SET updated_at = created_at WHERE project_id = ${q(projectId)};
UPDATE activities SET updated_at = created_at WHERE project_id = ${q(projectId)};
UPDATE activity_conflicts SET updated_at = created_at WHERE project_id = ${q(projectId)};
UPDATE stakeholders SET updated_at = created_at WHERE project_id = ${q(projectId)};
UPDATE doc_links SET updated_at = created_at WHERE project_id = ${q(projectId)};

-- Version history: everything above as one change
${importContext}

${history("project", "projects", "x.id")}
${history("phase", "phases")}
${history("activity", "activities")}
${history("activity_conflict", "activity_conflicts")}
${history("stakeholder", "stakeholders")}
${history("doc_link", "doc_links")}
COMMIT;
`;
  writeFileSync(output, sql, "utf8");

  const unusedConflicts = [...conflictsByActivity.keys()].filter((k) => !usedConflictKeys.has(k));
  console.log(`Fases: ${phaseRows.length}`);
  console.log(`Activiteiten: ${activityRows.length}`);
  console.log(`Stakeholders: ${stakeholderRows.length} (${allNames.size} verschillende partijen)`);
  console.log(`Belangenconflicten: ${conflictRows.length} bij ${usedConflictKeys.size} activiteiten`);
  console.log(`Bronlinks: ${linkRows.length}`);
  if (fuzzy.size) console.log(`\nKopjes met kleine naamverschillen:\n  ${[...fuzzy].join("\n  ")}`);
  if (withoutProfile.size) console.log(`\nPartijen zonder kopje in het Word-document:\n  ${[...withoutProfile].join("\n  ")}`);
  if (unusedSections.length) console.log(`\nKopjes in het Word-document zonder partij in V01:\n  ${unusedSections.join("\n  ")}`);
  if (unusedConflicts.length) console.log(`\nConflicten zonder bijpassende activiteit:\n  ${unusedConflicts.join("\n  ")}`);
  console.log(`\nSQL geschreven naar ${output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
