import ExcelJS from "exceljs";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { activities, phases, stakeholders } from "@/db/schema";
import { NotFoundError } from "@/lib/history";
import { ACTIVITY_STATUS_LABELS, ROLE_IN_ACTIVITY_LABELS, STAKEHOLDER_STATUS_LABELS } from "@/lib/labels";
import { getProject } from "@/lib/queries";
import { requireUser } from "@/lib/session";

/** Excel export: one row per stakeholder (activities without stakeholders get one row too). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser("viewer");
  } catch {
    return new Response("Geen toegang", { status: 403 });
  }
  const { id } = await params;
  let project;
  try {
    project = await getProject(id);
  } catch (e) {
    if (e instanceof NotFoundError) return new Response("Niet gevonden", { status: 404 });
    throw e;
  }

  const phaseRows = await db
    .select()
    .from(phases)
    .where(and(eq(phases.projectId, id), isNull(phases.deletedAt)))
    .orderBy(asc(phases.sortOrder));
  const activityRows = await db
    .select()
    .from(activities)
    .where(and(eq(activities.projectId, id), isNull(activities.deletedAt)))
    .orderBy(asc(activities.sortOrder), asc(activities.createdAt));
  const stakeholderRows = await db
    .select()
    .from(stakeholders)
    .where(and(eq(stakeholders.projectId, id), isNull(stakeholders.deletedAt)))
    .orderBy(asc(stakeholders.role), asc(stakeholders.sortOrder));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Stakeholders");
  ws.columns = [
    { header: "Fase", key: "phase", width: 24 },
    { header: "Nr.", key: "number", width: 7 },
    { header: "Activiteit", key: "activity", width: 32 },
    { header: "Status activiteit", key: "activityStatus", width: 18 },
    { header: "Beschrijving activiteit", key: "activityDescription", width: 40 },
    { header: "Resultaat", key: "result", width: 28 },
    { header: "Rol", key: "role", width: 14 },
    { header: "Naam / organisatie", key: "name", width: 30 },
    { header: "Status stakeholder", key: "status", width: 20 },
    { header: "Deadline", key: "deadline", width: 12 },
    { header: "Contactpersoon", key: "contact", width: 24 },
    { header: "E-mail", key: "email", width: 28 },
    { header: "Telefoon", key: "phone", width: 16 },
    { header: "Omschrijving", key: "description", width: 40 },
    { header: "Activiteiten (stakeholder)", key: "activities", width: 50 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const stakeholderCells = (s: (typeof stakeholderRows)[number]) => ({
    role: ROLE_IN_ACTIVITY_LABELS[s.role],
    name: s.name,
    status: STAKEHOLDER_STATUS_LABELS[s.status],
    deadline: s.deadline ? new Date(`${s.deadline}T00:00:00Z`) : null,
    contact: s.contactPerson,
    email: s.email,
    phone: s.phone,
    description: s.description,
    activities: s.activities,
  });

  for (const phase of phaseRows) {
    for (const a of activityRows.filter((x) => x.phaseId === phase.id)) {
      const activityCells = {
        phase: phase.name,
        number: a.number,
        activity: a.name,
        activityStatus: ACTIVITY_STATUS_LABELS[a.status],
        activityDescription: a.description,
        result: a.result,
      };
      const own = stakeholderRows.filter((s) => s.activityId === a.id);
      if (own.length === 0) ws.addRow(activityCells);
      for (const s of own) ws.addRow({ ...activityCells, ...stakeholderCells(s) });
    }
    // Stakeholders that are not linked to an activity yet.
    for (const s of stakeholderRows.filter((x) => x.phaseId === phase.id && !x.activityId)) {
      ws.addRow({ phase: phase.name, activity: "(zonder activiteit)", ...stakeholderCells(s) });
    }
  }
  ws.getColumn("deadline").numFmt = "dd-mm-yyyy";
  for (const key of ["activityDescription", "description", "activities"]) {
    ws.getColumn(key).alignment = { wrapText: true, vertical: "top" };
  }
  ws.autoFilter = { from: "A1", to: "O1" };

  const buffer = await wb.xlsx.writeBuffer();
  const safeName = project.name.replace(/[^\w\- ]+/g, "").trim() || "project";
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeName}.xlsx`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
