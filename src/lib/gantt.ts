import type ExcelJS from "exceljs";

/**
 * Gantt chart of the phases of a project, drawn with cell fills on an Excel worksheet
 * (ExcelJS cannot create native Excel charts). One timeline column per week, or per month
 * when the planning spans more than three years.
 */

export interface GanttPhase {
  name: string;
  startDate: string | null;
  endDate: string | null;
  complete: number;
  total: number;
}

const DAY = 86_400_000;
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const MAX_WEEKS = 156;

const COLOR_BAR = "FF2563EB";
const COLOR_BAR_DONE = "FF16A34A";
const COLOR_HEADER = "FFE2E8F0";
const COLOR_TODAY = "FFDC2626";
const COLOR_TODAY_LIGHT = "FFFEE2E2";
const COLOR_GRID = "FFE2E8F0";

/** Fixed columns before the timeline. */
const FIXED = [
  { header: "Nr.", width: 5 },
  { header: "Fase", width: 32 },
  { header: "Start", width: 12 },
  { header: "Eind", width: 12 },
  { header: "Dagen", width: 8 },
  { header: "Activiteiten afgerond", width: 12 },
];

interface Bucket {
  start: number; // inclusive, UTC ms
  end: number; // exclusive, UTC ms
  group: string; // label in the top header row (merged over equal neighbours)
  label: string; // label in the second header row
}

const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const weekday = (t: number) => (new Date(t).getUTCDay() + 6) % 7; // Monday = 0

function isoWeek(t: number) {
  const thursday = t + (3 - weekday(t)) * DAY;
  const jan1 = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1);
  return Math.floor((thursday - jan1) / DAY / 7) + 1;
}

function buckets(min: number, max: number): Bucket[] {
  const out: Bucket[] = [];
  const firstMonday = min - weekday(min) * DAY;
  if ((max - firstMonday) / DAY / 7 < MAX_WEEKS) {
    for (let t = firstMonday; t <= max; t += 7 * DAY) {
      // A week belongs to the month of its Thursday (ISO convention).
      const d = new Date(t + 3 * DAY);
      out.push({ start: t, end: t + 7 * DAY, group: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, label: `W${isoWeek(t)}` });
    }
  } else {
    const first = new Date(min);
    let y = first.getUTCFullYear();
    let m = first.getUTCMonth();
    for (let t = Date.UTC(y, m, 1); t <= max; t = Date.UTC(y, m, 1)) {
      const next = Date.UTC(y, m + 1, 1);
      out.push({ start: t, end: next, group: String(y), label: MONTHS[m] });
      m++;
      if (m === 12) {
        m = 0;
        y++;
      }
    }
  }
  return out;
}

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

export function addPhaseGanttSheet(wb: ExcelJS.Workbook, phases: GanttPhase[], today = new Date()) {
  const ws = wb.addWorksheet("Planning fases", {
    views: [{ state: "frozen", xSplit: FIXED.length, ySplit: 2 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  FIXED.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
    ws.mergeCells(1, i + 1, 2, i + 1);
    const cell = ws.getCell(1, i + 1);
    cell.value = c.header;
    cell.font = { bold: true };
    cell.fill = fill(COLOR_HEADER);
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  const planned = phases.filter((p) => p.startDate && p.endDate);
  const first = FIXED.length + 1;

  // Fixed columns, one row per phase (also phases without dates, so the list is complete).
  phases.forEach((p, i) => {
    const row = ws.getRow(3 + i);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = p.name;
    row.getCell(3).value = p.startDate ? new Date(toUtc(p.startDate)) : null;
    row.getCell(4).value = p.endDate ? new Date(toUtc(p.endDate)) : null;
    row.getCell(5).value =
      p.startDate && p.endDate ? (toUtc(p.endDate) - toUtc(p.startDate)) / DAY + 1 : "geen planning";
    row.getCell(6).value = `${p.complete}/${p.total}`;
  });
  ws.getColumn(3).numFmt = "dd-mm-yyyy";
  ws.getColumn(4).numFmt = "dd-mm-yyyy";
  ws.getColumn(5).alignment = { horizontal: "right" };
  ws.getColumn(6).alignment = { horizontal: "center" };

  if (planned.length === 0) {
    ws.getCell(1, first).value = "Nog geen fases met een start- én einddatum.";
    ws.getCell(1, first).font = { italic: true, color: { argb: "FF64748B" } };
    return ws;
  }

  const min = Math.min(...planned.map((p) => toUtc(p.startDate!)));
  const max = Math.max(...planned.map((p) => toUtc(p.endDate!)));
  const cols = buckets(min, max);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const todayIndex = cols.findIndex((b) => b.start <= now && now < b.end);

  // Header: top row merged per month (weeks) or year (months), second row per bucket.
  let groupStart = 0;
  cols.forEach((b, i) => {
    const col = first + i;
    ws.getColumn(col).width = 4;
    const label = ws.getCell(2, col);
    label.value = b.label;
    label.font = { size: 8, bold: i === todayIndex, color: i === todayIndex ? { argb: "FFFFFFFF" } : undefined };
    label.alignment = { horizontal: "center" };
    label.fill = fill(i === todayIndex ? COLOR_TODAY : COLOR_HEADER);
    const isLastOfGroup = i === cols.length - 1 || cols[i + 1].group !== b.group;
    if (isLastOfGroup) {
      if (i > groupStart) ws.mergeCells(1, first + groupStart, 1, col);
      const top = ws.getCell(1, first + groupStart);
      top.value = cols[groupStart].group;
      top.font = { bold: true, size: 9 };
      top.alignment = { horizontal: "center" };
      top.fill = fill(COLOR_HEADER);
      top.border = { left: { style: "thin", color: { argb: "FF94A3B8" } } };
      groupStart = i + 1;
    }
  });

  // Bars.
  phases.forEach((p, r) => {
    const row = ws.getRow(3 + r);
    const start = p.startDate ? toUtc(p.startDate) : null;
    const end = p.endDate ? toUtc(p.endDate) + DAY : null; // end date is inclusive
    const done = p.total > 0 && p.complete === p.total;
    cols.forEach((b, i) => {
      const cell = row.getCell(first + i);
      cell.border = { left: { style: "hair", color: { argb: COLOR_GRID } } };
      if (start !== null && end !== null && b.start < end && b.end > start) {
        cell.fill = fill(done ? COLOR_BAR_DONE : COLOR_BAR);
      } else if (i === todayIndex) {
        cell.fill = fill(COLOR_TODAY_LIGHT);
      }
    });
  });

  // Legend below the chart.
  const legendRow = 3 + phases.length + 1;
  const legend: [string, string][] = [
    [COLOR_BAR, "Geplande periode"],
    [COLOR_BAR_DONE, "Fase afgerond (alle activiteiten klaar)"],
  ];
  if (todayIndex >= 0) legend.push([COLOR_TODAY, "Huidige week/maand"]);
  legend.forEach(([color, text], i) => {
    ws.getCell(legendRow + i, 1).fill = fill(color);
    ws.getCell(legendRow + i, 2).value = text;
    ws.getCell(legendRow + i, 2).font = { size: 9, color: { argb: "FF475569" } };
  });

  return ws;
}
