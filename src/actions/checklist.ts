"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import {
  activities,
  activityConflicts,
  activityStatus,
  docFiles,
  docLinks,
  phases,
  stakeholderRole,
  stakeholderStatus,
  stakeholders,
  type Activity,
  type Phase,
  type Stakeholder,
} from "@/db/schema";
import { runAction, UserError } from "@/lib/action";
import { createEntity, deleteEntity, newBatch, updateEntity, type WriteContext } from "@/lib/history";
import { assertProjectWritable } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { formObject, id, optionalDate, optionalEmail, optionalText, requiredText, version } from "./forms";

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/");
}

async function activityOrThrow(tx: Tx, activityId: string): Promise<Activity> {
  const [a] = await tx.select().from(activities).where(eq(activities.id, id.parse(activityId)));
  if (!a || a.deletedAt) throw new UserError("Activiteit niet gevonden.");
  return a;
}

/** Soft-delete all live stakeholders matching `where` within a batch. */
async function deleteStakeholdersWhere(tx: Tx, ctx: WriteContext, where: ReturnType<typeof eq>) {
  const rows = await tx
    .select({ id: stakeholders.id })
    .from(stakeholders)
    .where(and(where, isNull(stakeholders.deletedAt)));
  for (const r of rows) await deleteEntity(tx, ctx, "stakeholder", r.id, null);
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

const phaseFields = z
  .object({
    name: requiredText("Naam", 200),
    description: optionalText(),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    message: "De einddatum van de fase ligt vóór de startdatum.",
  });

export async function createPhase(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    const projectId = id.parse(raw.projectId);
    const values = phaseFields.parse(raw);
    await db.transaction(async (tx) => {
      await assertProjectWritable(tx, projectId);
      const [{ last }] = await tx
        .select({ last: max(phases.sortOrder) })
        .from(phases)
        .where(and(eq(phases.projectId, projectId), isNull(phases.deletedAt)));
      await createEntity<Phase>(tx, newBatch(user.id, "Fase toegevoegd"), "phase", {
        ...values,
        projectId,
        sortOrder: (last ?? 0) + 1,
      });
    });
    revalidateProject(projectId);
  });
}

export async function updatePhase(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    const phaseId = id.parse(raw.id);
    const values = phaseFields.parse(raw);
    const phase = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(phases).where(eq(phases.id, phaseId));
      if (!current) throw new UserError("Fase niet gevonden.");
      await assertProjectWritable(tx, current.projectId);
      return updateEntity<Phase>(tx, newBatch(user.id), "phase", phaseId, version.parse(raw.version), values);
    });
    revalidateProject(phase.projectId);
  });
}

/** Soft-deletes the phase with all its activities and stakeholders in one batch (revertable together). */
export async function deletePhase(phaseId: string, expectedVersion: number) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const projectId = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(phases).where(eq(phases.id, id.parse(phaseId)));
      if (!current) throw new UserError("Fase niet gevonden.");
      await assertProjectWritable(tx, current.projectId);
      const ctx = newBatch(user.id, `Fase "${current.name}" verwijderd`);
      await deleteStakeholdersWhere(tx, ctx, eq(stakeholders.phaseId, phaseId));
      const acts = await tx
        .select({ id: activities.id })
        .from(activities)
        .where(and(eq(activities.phaseId, phaseId), isNull(activities.deletedAt)));
      for (const a of acts) await deleteEntity(tx, ctx, "activity", a.id, null);
      await deleteEntity(tx, ctx, "phase", phaseId, expectedVersion);
      return current.projectId;
    });
    revalidateProject(projectId);
  });
}

/** Persist a new phase order (drag & drop). */
export async function reorderPhases(projectId: string, orderedIds: string[]) {
  return runAction(async () => {
    const user = await requireUser("editor");
    await db.transaction(async (tx) => {
      await assertProjectWritable(tx, id.parse(projectId));
      const ctx = newBatch(user.id, "Volgorde fases gewijzigd");
      const existing = await tx
        .select()
        .from(phases)
        .where(and(eq(phases.projectId, projectId), isNull(phases.deletedAt)));
      const known = new Set(existing.map((p) => p.id));
      let order = 1;
      for (const phaseId of orderedIds) {
        if (!known.has(phaseId)) continue;
        const current = existing.find((p) => p.id === phaseId)!;
        if (current.sortOrder !== order) {
          await updateEntity(tx, ctx, "phase", phaseId, null, { sortOrder: order });
        }
        order++;
      }
    });
    revalidateProject(projectId);
  });
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

const activityFields = z.object({
  number: optionalText(20),
  name: requiredText("Naam", 300),
  description: optionalText(20_000),
  result: optionalText(5_000),
});

export async function createActivity(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    const phaseId = id.parse(raw.phaseId);
    const values = activityFields.parse(raw);
    const created = await db.transaction(async (tx) => {
      const [phase] = await tx.select().from(phases).where(eq(phases.id, phaseId));
      if (!phase || phase.deletedAt) throw new UserError("Fase niet gevonden.");
      await assertProjectWritable(tx, phase.projectId);
      const [{ last }] = await tx
        .select({ last: max(activities.sortOrder) })
        .from(activities)
        .where(and(eq(activities.phaseId, phaseId), isNull(activities.deletedAt)));
      return createEntity<Activity>(tx, newBatch(user.id, "Activiteit toegevoegd"), "activity", {
        ...values,
        projectId: phase.projectId,
        phaseId,
        sortOrder: (last ?? 0) + 1,
      });
    });
    revalidateProject(created.projectId);
    return { id: created.id, projectId: created.projectId };
  });
}

async function updateActivityWith(raw: Record<string, string>, patch: Record<string, unknown>, userId: string) {
  const activityId = id.parse(raw.id);
  const updated = await db.transaction(async (tx) => {
    const current = await activityOrThrow(tx, activityId);
    await assertProjectWritable(tx, current.projectId);
    return updateEntity<Activity>(tx, newBatch(userId), "activity", activityId, version.parse(raw.version), patch);
  });
  revalidateProject(updated.projectId);
}

export async function updateActivity(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    await updateActivityWith(raw, activityFields.parse(raw), user.id);
  });
}

export async function setActivityStatus(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    const status = z.enum(activityStatus.enumValues).parse(raw.status);
    await updateActivityWith(raw, { status, statusChangedBy: user.id, statusChangedAt: new Date() }, user.id);
  });
}

/** Soft-deletes the activity and its stakeholders in one batch. */
export async function deleteActivity(activityId: string, expectedVersion: number) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const projectId = await db.transaction(async (tx) => {
      const current = await activityOrThrow(tx, activityId);
      await assertProjectWritable(tx, current.projectId);
      const ctx = newBatch(user.id, `Activiteit "${`${current.number} ${current.name}`.trim()}" verwijderd`);
      await deleteStakeholdersWhere(tx, ctx, eq(stakeholders.activityId, current.id));
      const conflicts = await tx
        .select({ id: activityConflicts.id })
        .from(activityConflicts)
        .where(and(eq(activityConflicts.activityId, current.id), isNull(activityConflicts.deletedAt)));
      for (const c of conflicts) await deleteEntity(tx, ctx, "activity_conflict", c.id, null);
      await deleteEntity(tx, ctx, "activity", current.id, expectedVersion);
      return current.projectId;
    });
    revalidateProject(projectId);
  });
}

const arrangeActivitiesInput = z.object({
  projectId: z.uuid(),
  phases: z.array(z.object({ phaseId: z.uuid(), activityIds: z.array(z.uuid()) })).min(1),
});

/**
 * Reorder activities within a phase and/or move them to another phase (drag & drop).
 * Moving an activity moves its stakeholders to the new phase as well.
 */
export async function arrangeActivities(input: z.input<typeof arrangeActivitiesInput>) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const { projectId, phases: layout } = arrangeActivitiesInput.parse(input);
    await db.transaction(async (tx) => {
      await assertProjectWritable(tx, projectId);
      const phaseRows = await tx
        .select()
        .from(phases)
        .where(and(eq(phases.projectId, projectId), isNull(phases.deletedAt)));
      const phaseIds = new Set(phaseRows.map((p) => p.id));
      const current = await tx
        .select()
        .from(activities)
        .where(and(eq(activities.projectId, projectId), isNull(activities.deletedAt)));
      const byId = new Map(current.map((a) => [a.id, a]));
      const moved = layout.some((p) => p.activityIds.some((aid) => byId.get(aid)?.phaseId !== p.phaseId));
      const ctx = newBatch(user.id, moved ? "Activiteit verplaatst naar andere fase" : "Volgorde activiteiten gewijzigd");
      for (const { phaseId, activityIds } of layout) {
        if (!phaseIds.has(phaseId)) throw new UserError("Fase niet gevonden.");
        let order = 1;
        for (const aid of activityIds) {
          const a = byId.get(aid);
          if (!a) throw new UserError("Activiteit niet gevonden. Herlaad de pagina.");
          if (a.phaseId !== phaseId) {
            const children = await tx
              .select({ id: stakeholders.id })
              .from(stakeholders)
              .where(and(eq(stakeholders.activityId, aid), isNull(stakeholders.deletedAt)));
            for (const c of children) await updateEntity(tx, ctx, "stakeholder", c.id, null, { phaseId });
          }
          if (a.phaseId !== phaseId || a.sortOrder !== order) {
            await updateEntity(tx, ctx, "activity", aid, null, { phaseId, sortOrder: order });
          }
          order++;
        }
      }
    });
    revalidateProject(projectId);
  });
}

// ---------------------------------------------------------------------------
// Stakeholders (each belongs to one activity, as "lead" or "involved")
// ---------------------------------------------------------------------------

/** Fields edited in the stakeholder pop-up ("Contactgegevens bewerken"). */
const contactFields = z.object({
  name: requiredText("Naam/organisatie", 200),
  contactPerson: optionalText(200),
  email: optionalEmail,
  phone: optionalText(50),
  description: optionalText(),
  deadline: optionalDate,
});

const stakeholderFields = contactFields.extend({ interests: optionalText(20_000) });

export async function createStakeholder(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    const role = z.enum(stakeholderRole.enumValues).parse(raw.role || "involved");
    const values = stakeholderFields.parse(raw);
    const created = await db.transaction(async (tx) => {
      const activity = await activityOrThrow(tx, raw.activityId);
      await assertProjectWritable(tx, activity.projectId);
      const [{ last }] = await tx
        .select({ last: max(stakeholders.sortOrder) })
        .from(stakeholders)
        .where(and(eq(stakeholders.activityId, activity.id), isNull(stakeholders.deletedAt)));
      return createEntity<Stakeholder>(tx, newBatch(user.id, "Stakeholder toegevoegd"), "stakeholder", {
        ...values,
        projectId: activity.projectId,
        phaseId: activity.phaseId,
        activityId: activity.id,
        role,
        sortOrder: (last ?? 0) + 1,
      });
    });
    revalidateProject(created.projectId);
    return { id: created.id, projectId: created.projectId };
  });
}

/**
 * Link an existing stakeholder (from another activity in the same project) to this activity as well.
 * Stakeholders are separate rows per activity, so this creates a new row with the same name, contact
 * details and background, plus copies of its documentation. Status starts at "not started"; deadline,
 * activity log and comments stay with the original.
 */
export async function linkExistingStakeholder(activityId: string, sourceStakeholderId: string, role: "lead" | "involved") {
  return runAction(async () => {
    const user = await requireUser("editor");
    const parsedRole = z.enum(stakeholderRole.enumValues).parse(role);
    const created = await db.transaction(async (tx) => {
      const activity = await activityOrThrow(tx, activityId);
      await assertProjectWritable(tx, activity.projectId);
      const [src] = await tx.select().from(stakeholders).where(eq(stakeholders.id, id.parse(sourceStakeholderId)));
      if (!src || src.deletedAt || src.projectId !== activity.projectId) throw new UserError("Stakeholder niet gevonden.");
      const [dup] = await tx
        .select({ id: stakeholders.id })
        .from(stakeholders)
        .where(and(eq(stakeholders.activityId, activity.id), eq(stakeholders.name, src.name), isNull(stakeholders.deletedAt)));
      if (dup) throw new UserError(`"${src.name}" is al gekoppeld aan deze activiteit.`);
      const [{ last }] = await tx
        .select({ last: max(stakeholders.sortOrder) })
        .from(stakeholders)
        .where(and(eq(stakeholders.activityId, activity.id), isNull(stakeholders.deletedAt)));
      const label = `${activity.number} ${activity.name}`.trim();
      const ctx = newBatch(user.id, `Bestaande stakeholder "${src.name}" gekoppeld aan "${label}"`);
      const copy = await createEntity<Stakeholder>(tx, ctx, "stakeholder", {
        projectId: activity.projectId,
        phaseId: activity.phaseId,
        activityId: activity.id,
        role: parsedRole,
        sortOrder: (last ?? 0) + 1,
        name: src.name,
        contactPerson: src.contactPerson,
        email: src.email,
        phone: src.phone,
        description: src.description,
        interests: src.interests,
        profile: src.profile,
      });
      const links = await tx
        .select()
        .from(docLinks)
        .where(and(eq(docLinks.stakeholderId, src.id), isNull(docLinks.deletedAt)));
      for (const l of links) {
        await createEntity(tx, ctx, "doc_link", {
          projectId: activity.projectId,
          stakeholderId: copy.id,
          title: l.title,
          url: l.url,
          description: l.description,
          createdBy: user.id,
        });
      }
      const files = await tx
        .select()
        .from(docFiles)
        .where(and(eq(docFiles.stakeholderId, src.id), isNull(docFiles.deletedAt)));
      for (const f of files) {
        // The file contents (blob) are shared, not duplicated.
        await createEntity(tx, ctx, "doc_file", {
          projectId: activity.projectId,
          stakeholderId: copy.id,
          blobId: f.blobId,
          filename: f.filename,
          mimeType: f.mimeType,
          size: f.size,
          createdBy: user.id,
        });
      }
      return copy;
    });
    revalidateProject(created.projectId);
    return { id: created.id };
  });
}

async function updateStakeholderWith(raw: Record<string, string>, patch: Record<string, unknown>, userId: string) {
  const stakeholderId = id.parse(raw.id);
  const updated = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(stakeholders).where(eq(stakeholders.id, stakeholderId));
    if (!current) throw new UserError("Stakeholder niet gevonden.");
    await assertProjectWritable(tx, current.projectId);
    return updateEntity<Stakeholder>(tx, newBatch(userId), "stakeholder", stakeholderId, version.parse(raw.version), patch);
  });
  revalidateProject(updated.projectId);
}

/** Update name, contact details, deadline and description (never interests or profile). */
export async function updateStakeholder(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    await updateStakeholderWith(raw, contactFields.parse(raw), user.id);
  });
}

/** Background text about the stakeholder ("Over deze stakeholder"). */
export async function updateProfile(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    const profile = z.string().max(50_000, "Tekst is te lang.").parse(raw.profile ?? "");
    await updateStakeholderWith(raw, { profile }, user.id);
  });
}

export async function updateActivities(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    const text = z.string().max(100_000, "Activiteiten is te lang.").parse(raw.activities ?? "");
    await updateStakeholderWith(raw, { activities: text }, user.id);
  });
}

/** Inline edit of "Belangen en eisen". */
export async function updateInterests(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    const interests = z.string().max(20_000, "Belangen en eisen is te lang.").parse(raw.interests ?? "");
    await updateStakeholderWith(raw, { interests }, user.id);
  });
}

export async function setStakeholderStatus(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    const status = z.enum(stakeholderStatus.enumValues).parse(raw.status);
    await updateStakeholderWith(raw, { status, statusChangedBy: user.id, statusChangedAt: new Date() }, user.id);
  });
}

export async function deleteStakeholder(stakeholderId: string, expectedVersion: number) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const projectId = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(stakeholders).where(eq(stakeholders.id, id.parse(stakeholderId)));
      if (!current) throw new UserError("Stakeholder niet gevonden.");
      await assertProjectWritable(tx, current.projectId);
      await deleteEntity(tx, newBatch(user.id, `Stakeholder "${current.name}" verwijderd`), "stakeholder", stakeholderId, expectedVersion);
      return current.projectId;
    });
    revalidateProject(projectId);
  });
}

const arrangeStakeholdersInput = z.object({
  activityId: z.uuid(),
  lead: z.array(z.uuid()),
  involved: z.array(z.uuid()),
});

/** Reorder the stakeholders of an activity and/or switch them between "Leidend" and "Ook betrokken". */
export async function arrangeStakeholders(input: z.input<typeof arrangeStakeholdersInput>) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const { activityId, lead, involved } = arrangeStakeholdersInput.parse(input);
    const projectId = await db.transaction(async (tx) => {
      const activity = await activityOrThrow(tx, activityId);
      await assertProjectWritable(tx, activity.projectId);
      const current = await tx
        .select()
        .from(stakeholders)
        .where(and(eq(stakeholders.activityId, activityId), isNull(stakeholders.deletedAt)));
      const byId = new Map(current.map((s) => [s.id, s]));
      const roleChanged = [...lead.map((i) => [i, "lead"]), ...involved.map((i) => [i, "involved"])].some(
        ([sid, role]) => byId.get(sid)?.role !== role,
      );
      const ctx = newBatch(user.id, roleChanged ? "Rol van stakeholder gewijzigd" : "Volgorde stakeholders gewijzigd");
      let order = 1;
      for (const [list, role] of [
        [lead, "lead"],
        [involved, "involved"],
      ] as const) {
        for (const sid of list) {
          const s = byId.get(sid);
          if (!s) throw new UserError("Stakeholder niet gevonden. Herlaad de pagina.");
          if (s.role !== role || s.sortOrder !== order) {
            await updateEntity(tx, ctx, "stakeholder", sid, null, { role, sortOrder: order });
          }
          order++;
        }
      }
      return activity.projectId;
    });
    revalidateProject(projectId);
  });
}

/** Link a stakeholder to (another) activity with a role; its phase follows the activity. */
export async function assignStakeholder(stakeholderId: string, activityId: string, role: "lead" | "involved") {
  return runAction(async () => {
    const user = await requireUser("editor");
    const projectId = await db.transaction(async (tx) => {
      const [s] = await tx.select().from(stakeholders).where(eq(stakeholders.id, id.parse(stakeholderId)));
      if (!s || s.deletedAt) throw new UserError("Stakeholder niet gevonden.");
      await assertProjectWritable(tx, s.projectId);
      const activity = await activityOrThrow(tx, activityId);
      if (activity.projectId !== s.projectId) throw new UserError("Activiteit hoort bij een ander project.");
      const parsedRole = z.enum(stakeholderRole.enumValues).parse(role);
      if (s.activityId === activity.id && s.role === parsedRole) return s.projectId;
      const [{ last }] = await tx
        .select({ last: max(stakeholders.sortOrder) })
        .from(stakeholders)
        .where(and(eq(stakeholders.activityId, activity.id), isNull(stakeholders.deletedAt)));
      const label = `${activity.number} ${activity.name}`.trim();
      await updateEntity(tx, newBatch(user.id, `Stakeholder gekoppeld aan activiteit "${label}"`), "stakeholder", s.id, null, {
        activityId: activity.id,
        phaseId: activity.phaseId,
        role: parsedRole,
        sortOrder: s.activityId === activity.id ? s.sortOrder : (last ?? 0) + 1,
      });
      return s.projectId;
    });
    revalidateProject(projectId);
  });
}

// ---------------------------------------------------------------------------
// Conflicts of interest per activity
// ---------------------------------------------------------------------------

const conflictFields = z.object({
  title: requiredText("Belangenconflict", 500),
  severity: optionalText(20),
  theme: optionalText(200),
  sideA: optionalText(2_000),
  sideB: optionalText(2_000),
  why: optionalText(20_000),
  solutions: optionalText(20_000),
});

export async function createActivityConflict(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    const values = conflictFields.parse(raw);
    const projectId = await db.transaction(async (tx) => {
      const activity = await activityOrThrow(tx, raw.activityId);
      await assertProjectWritable(tx, activity.projectId);
      const [{ last }] = await tx
        .select({ last: max(activityConflicts.sortOrder) })
        .from(activityConflicts)
        .where(and(eq(activityConflicts.activityId, activity.id), isNull(activityConflicts.deletedAt)));
      await createEntity(tx, newBatch(user.id, "Belangenconflict toegevoegd"), "activity_conflict", {
        ...values,
        projectId: activity.projectId,
        activityId: activity.id,
        sortOrder: (last ?? 0) + 1,
      });
      return activity.projectId;
    });
    revalidateProject(projectId);
  });
}

export async function updateActivityConflict(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    const values = conflictFields.parse(raw);
    const projectId = await db.transaction(async (tx) => {
      const [c] = await tx.select().from(activityConflicts).where(eq(activityConflicts.id, id.parse(raw.id)));
      if (!c || c.deletedAt) throw new UserError("Belangenconflict niet gevonden.");
      await assertProjectWritable(tx, c.projectId);
      await updateEntity(tx, newBatch(user.id), "activity_conflict", c.id, version.parse(raw.version), values);
      return c.projectId;
    });
    revalidateProject(projectId);
  });
}

export async function deleteActivityConflict(conflictId: string, expectedVersion: number) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const projectId = await db.transaction(async (tx) => {
      const [c] = await tx.select().from(activityConflicts).where(eq(activityConflicts.id, id.parse(conflictId)));
      if (!c) throw new UserError("Belangenconflict niet gevonden.");
      await assertProjectWritable(tx, c.projectId);
      await deleteEntity(tx, newBatch(user.id, `Belangenconflict "${c.title}" verwijderd`), "activity_conflict", c.id, expectedVersion);
      return c.projectId;
    });
    revalidateProject(projectId);
  });
}
