/**
 * Reader for the "Stakeholders per fase" Excel sheet (V01 and later versions).
 *
 * Layout (first worksheet):
 *   - phase header row:  "Fase N – <name>"   (merged over A:F)
 *   - next row:          phase description   (merged over A:F)
 *   - step rows:         Nr ("1.2") | Deelfase | Wat doe/controleer je? | Leidend | Ook betrokken | Resultaat
 *     "Ook betrokken" lists several stakeholders, one per line (or separated by " / ").
 *
 * In the app every step row is an activity; "Leidend" and "Ook betrokken" are its stakeholders.
 */
import ExcelJS from "exceljs";

export interface Step {
  nr: string;
  title: string;
  check: string;
  lead: string;
  involved: string[];
  result: string;
}

export interface PhaseIn {
  name: string;
  description: string;
  steps: Step[];
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

export async function readPhaseSheet(path: string): Promise<PhaseIn[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  const phases: PhaseIn[] = [];
  let expectDescription = false;

  ws.eachRow((row) => {
    const a = text(row.getCell(1).value).trim();
    const phaseMatch = a.match(/^Fase\s+\d+\s*[–-]\s*(.+)$/);
    if (phaseMatch) {
      phases.push({ name: phaseMatch[1].trim(), description: "", steps: [] });
      expectDescription = true;
      return;
    }
    const current = phases[phases.length - 1];
    if (!current) return;
    if (/^\d+\.\d+$/.test(a)) {
      expectDescription = false;
      current.steps.push({
        nr: a,
        title: text(row.getCell(2).value).trim(),
        check: text(row.getCell(3).value).trim(),
        lead: text(row.getCell(4).value).trim(),
        involved: text(row.getCell(5).value)
          .split(/\r?\n| \/ /)
          .map((s) => s.trim())
          .filter(Boolean),
        result: text(row.getCell(6).value).trim(),
      });
      return;
    }
    if (expectDescription && a) {
      current.description = a;
      expectDescription = false;
    }
  });
  if (phases.length === 0) throw new Error("No 'Fase N – …' rows found in the first worksheet.");
  return phases;
}

/** Stakeholders of a step in display order: the leading one first, then the involved ones (no duplicates). */
export function membersOf(step: Step): { name: string; role: "lead" | "involved" }[] {
  const out: { name: string; role: "lead" | "involved" }[] = [];
  if (step.lead) out.push({ name: step.lead, role: "lead" });
  for (const n of step.involved) if (!out.some((m) => m.name === n)) out.push({ name: n, role: "involved" });
  return out;
}
