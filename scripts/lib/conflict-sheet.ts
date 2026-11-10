/**
 * Reader for the "Belangenverstrengeling per fase" Excel, worksheet "Belangen per deelfase":
 *   A Fase | B Nr. deelfase | C Deelfase | D Conflict nr. | E Thema | F Belangenconflict | G Ernst |
 *   H Kant A | I Kant B | J Waarom botsen de belangen? | K Mogelijke oplossingsrichtingen | …
 * One row = one conflict in one deelfase (activity).
 */
import ExcelJS from "exceljs";

export interface ConflictRow {
  /** Phase name without "Fase N – ". */
  phase: string;
  /** Activity number, e.g. "1.2". */
  stepNr: string;
  nr: number | null;
  theme: string;
  title: string;
  severity: string;
  sideA: string;
  sideB: string;
  why: string;
  solutions: string;
}

const SEVERITY_ORDER: Record<string, number> = { hoog: 0, middel: 1, laag: 2 };

function text(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return String(v.result ?? "");
  }
  return String(v);
}

export async function readConflictSheet(path: string): Promise<ConflictRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet("Belangen per deelfase");
  if (!ws) throw new Error('Worksheet "Belangen per deelfase" not found.');
  const rows: ConflictRow[] = [];
  ws.eachRow((row, r) => {
    if (r === 1) return;
    const c = (i: number) => text(row.getCell(i).value).trim();
    if (!c(1) || !c(6)) return;
    const nr = Number(c(4));
    rows.push({
      phase: c(1).replace(/^Fase\s+\d+\s*[–-]\s*/, "").trim(),
      stepNr: c(2),
      nr: c(4) !== "" && Number.isFinite(nr) ? nr : null,
      theme: c(5),
      title: c(6),
      severity: c(7),
      sideA: c(8).split(/\s*;\s*/).filter(Boolean).join("; "),
      sideB: c(9).split(/\s*;\s*/).filter(Boolean).join("; "),
      why: c(10),
      solutions: c(11),
    });
  });
  return rows;
}

/** Display order within an activity: severity (Hoog, Middel, Laag), then conflict number. */
export function bySeverity(a: ConflictRow, b: ConflictRow) {
  return (
    (SEVERITY_ORDER[a.severity.toLowerCase()] ?? 9) - (SEVERITY_ORDER[b.severity.toLowerCase()] ?? 9) ||
    (a.nr ?? 0) - (b.nr ?? 0)
  );
}
