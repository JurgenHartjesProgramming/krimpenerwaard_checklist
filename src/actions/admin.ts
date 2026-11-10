"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, isNull, max, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  activities,
  activityConflicts,
  adminAudit,
  comments,
  docFiles,
  docLinks,
  historyEvents,
  phases,
  stakeholders,
  userRole,
  userStatus,
  users,
  type Activity,
  type Phase,
} from "@/db/schema";
import { runAction, UserError } from "@/lib/action";
import { createEntity, newBatch, restoreProjectTo, revertEvent } from "@/lib/history";
import { assertProjectWritable } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { id } from "./forms";

// ---------------------------------------------------------------------------
// History: revert one change / restore project to a point in time (admin only)
// ---------------------------------------------------------------------------

export async function revertHistoryEvent(eventId: number) {
  return runAction(async () => {
    const user = await requireUser("admin");
    const [event] = await db.select().from(historyEvents).where(eq(historyEvents.id, eventId));
    if (!event) throw new UserError("Wijziging niet gevonden.");
    const changed = await db.transaction((tx) =>
      revertEvent(tx, newBatch(user.id, `Wijziging #${eventId} teruggedraaid`), eventId),
    );
    if (!changed) throw new UserError("Er was niets om terug te draaien: de huidige situatie is al gelijk.");
    revalidatePath(`/projects/${event.projectId}`, "layout");
    revalidatePath("/");
  });
}

export async function restoreProject(projectId: string, isoTimestamp: string) {
  return runAction(async () => {
    const user = await requireUser("admin");
    const at = new Date(isoTimestamp);
    if (Number.isNaN(at.getTime())) throw new UserError("Ongeldig tijdstip.");
    const label = at.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });
    const changed = await db.transaction((tx) =>
      restoreProjectTo(tx, newBatch(user.id, `Project teruggezet naar ${label}`), id.parse(projectId), at),
    );
    revalidatePath(`/projects/${projectId}`, "layout");
    revalidatePath("/");
    return { changed };
  });
}

// ---------------------------------------------------------------------------
// Copy phases / activities (with their stakeholders) from another project (admin only)
// ---------------------------------------------------------------------------

const copyInput = z.object({
  targetProjectId: z.uuid(),
  sourceProjectId: z.uuid(),
  /** Phases selected as a whole (created/matched even if empty; phase comments and unlinked stakeholders follow). */
  phaseIds: z.array(z.uuid()),
  /** Activities to copy, each with all its stakeholders. */
  activityIds: z.array(z.uuid()),
  includeComments: z.boolean(),
  /** Also copy general project documents (Documenten tab). */
  includeProjectDocs: z.boolean().default(false),
});

export async function copyFromProject(input: z.input<typeof copyInput>) {
  return runAction(async () => {
    const user = await requireUser("admin");
    const { targetProjectId, sourceProjectId, phaseIds, activityIds, includeComments, includeProjectDocs } =
      copyInput.parse(input);
    if (targetProjectId === sourceProjectId) throw new UserError("Kies een ander bronproject.");

    const result = await db.transaction(async (tx) => {
      await assertProjectWritable(tx, targetProjectId);
      const ctx = newBatch(user.id, "Gekopieerd uit ander project");

      const sourcePhases = await tx
        .select()
        .from(phases)
        .where(and(eq(phases.projectId, sourceProjectId), isNull(phases.deletedAt)))
        .orderBy(asc(phases.sortOrder));
      const sourceActivities = activityIds.length
        ? await tx
            .select()
            .from(activities)
            .where(
              and(eq(activities.projectId, sourceProjectId), inArray(activities.id, activityIds), isNull(activities.deletedAt)),
            )
            .orderBy(asc(activities.sortOrder))
        : [];
      const targetPhases = await tx
        .select()
        .from(phases)
        .where(and(eq(phases.projectId, targetProjectId), isNull(phases.deletedAt)));
      let nextPhaseOrder = Math.max(0, ...targetPhases.map((p) => p.sortOrder)) + 1;

      let phaseCount = 0;
      let activityCount = 0;
      let stakeholderCount = 0;

      /** Copy one stakeholder with its documentation (and comments if asked). Status is reset. */
      const copyStakeholder = async (
        s: typeof stakeholders.$inferSelect,
        phaseId: string,
        activityId: string | null,
      ) => {
        const copy = await createEntity(tx, ctx, "stakeholder", {
          projectId: targetProjectId,
          phaseId,
          activityId,
          role: s.role,
          sortOrder: s.sortOrder,
          name: s.name,
          contactPerson: s.contactPerson,
          email: s.email,
          phone: s.phone,
          description: s.description,
          deadline: s.deadline,
          activities: s.activities,
          interests: s.interests,
          profile: s.profile,
          status: "not_started",
        });
        stakeholderCount++;
        const links = await tx
          .select()
          .from(docLinks)
          .where(and(eq(docLinks.stakeholderId, s.id), isNull(docLinks.deletedAt)));
        for (const l of links) {
          await createEntity(tx, ctx, "doc_link", {
            projectId: targetProjectId,
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
          .where(and(eq(docFiles.stakeholderId, s.id), isNull(docFiles.deletedAt)));
        for (const f of files) {
          // The blob is shared, not duplicated.
          await createEntity(tx, ctx, "doc_file", {
            projectId: targetProjectId,
            stakeholderId: copy.id,
            blobId: f.blobId,
            filename: f.filename,
            mimeType: f.mimeType,
            size: f.size,
            createdBy: user.id,
          });
        }
        if (includeComments) {
          const stakeholderComments = await tx
            .select()
            .from(comments)
            .where(and(eq(comments.stakeholderId, s.id), isNull(comments.deletedAt)));
          for (const c of stakeholderComments) {
            await createEntity(tx, ctx, "comment", {
              projectId: targetProjectId,
              stakeholderId: copy.id,
              authorId: c.authorId,
              body: c.body,
              labels: c.labels,
              editedAt: c.editedAt,
              createdAt: c.createdAt,
            });
          }
        }
      };

      for (const sp of sourcePhases) {
        const wholePhase = phaseIds.includes(sp.id);
        const picked = sourceActivities.filter((a) => a.phaseId === sp.id);
        if (!wholePhase && picked.length === 0) continue;

        // Append to an existing phase with the same name, otherwise create it.
        let target: Phase | undefined = targetPhases.find(
          (p) => p.name.trim().toLowerCase() === sp.name.trim().toLowerCase(),
        );
        if (!target) {
          target = await createEntity<Phase>(tx, ctx, "phase", {
            projectId: targetProjectId,
            name: sp.name,
            description: sp.description,
            sortOrder: nextPhaseOrder++,
          });
          targetPhases.push(target);
          phaseCount++;
        }

        if (wholePhase && includeComments) {
          const phaseComments = await tx
            .select()
            .from(comments)
            .where(and(eq(comments.phaseId, sp.id), isNull(comments.deletedAt)));
          for (const c of phaseComments) {
            await createEntity(tx, ctx, "comment", {
              projectId: targetProjectId,
              phaseId: target.id,
              authorId: c.authorId,
              body: c.body,
              labels: c.labels,
              editedAt: c.editedAt,
              createdAt: c.createdAt,
            });
          }
        }

        const [{ last }] = await tx
          .select({ last: max(activities.sortOrder) })
          .from(activities)
          .where(and(eq(activities.phaseId, target.id), isNull(activities.deletedAt)));
        let order = (last ?? 0) + 1;
        for (const a of picked) {
          const copy = await createEntity<Activity>(tx, ctx, "activity", {
            projectId: targetProjectId,
            phaseId: target.id,
            number: a.number,
            name: a.name,
            description: a.description,
            result: a.result,
            // Status is deliberately not copied.
            status: "not_started",
            sortOrder: order++,
          });
          activityCount++;
          const conflicts = await tx
            .select()
            .from(activityConflicts)
            .where(and(eq(activityConflicts.activityId, a.id), isNull(activityConflicts.deletedAt)))
            .orderBy(asc(activityConflicts.sortOrder));
          for (const k of conflicts) {
            await createEntity(tx, ctx, "activity_conflict", {
              projectId: targetProjectId,
              activityId: copy.id,
              conflictNumber: k.conflictNumber,
              title: k.title,
              theme: k.theme,
              severity: k.severity,
              sideA: k.sideA,
              sideB: k.sideB,
              why: k.why,
              solutions: k.solutions,
              sortOrder: k.sortOrder,
            });
          }
          const own = await tx
            .select()
            .from(stakeholders)
            .where(and(eq(stakeholders.activityId, a.id), isNull(stakeholders.deletedAt)))
            .orderBy(asc(stakeholders.sortOrder));
          for (const s of own) await copyStakeholder(s, target.id, copy.id);
          if (includeComments) {
            const activityComments = await tx
              .select()
              .from(comments)
              .where(and(eq(comments.activityId, a.id), isNull(comments.deletedAt)));
            for (const c of activityComments) {
              await createEntity(tx, ctx, "comment", {
                projectId: targetProjectId,
                activityId: copy.id,
                authorId: c.authorId,
                body: c.body,
                labels: c.labels,
                editedAt: c.editedAt,
                createdAt: c.createdAt,
              });
            }
          }
        }

        // Stakeholders without activity (older data) follow their phase when it is copied as a whole.
        if (wholePhase) {
          const unlinked = await tx
            .select()
            .from(stakeholders)
            .where(and(eq(stakeholders.phaseId, sp.id), isNull(stakeholders.activityId), isNull(stakeholders.deletedAt)));
          for (const s of unlinked) await copyStakeholder(s, target.id, null);
        }
      }

      // General project documents (not tied to a stakeholder).
      let projectDocCount = 0;
      if (includeProjectDocs) {
        const links = await tx
          .select()
          .from(docLinks)
          .where(and(eq(docLinks.projectId, sourceProjectId), isNull(docLinks.stakeholderId), isNull(docLinks.deletedAt)));
        for (const l of links) {
          await createEntity(tx, ctx, "doc_link", {
            projectId: targetProjectId,
            stakeholderId: null,
            title: l.title,
            url: l.url,
            description: l.description,
            createdBy: user.id,
          });
          projectDocCount++;
        }
        const files = await tx
          .select()
          .from(docFiles)
          .where(and(eq(docFiles.projectId, sourceProjectId), isNull(docFiles.stakeholderId), isNull(docFiles.deletedAt)));
        for (const f of files) {
          await createEntity(tx, ctx, "doc_file", {
            projectId: targetProjectId,
            stakeholderId: null,
            blobId: f.blobId,
            filename: f.filename,
            mimeType: f.mimeType,
            size: f.size,
            createdBy: user.id,
          });
          projectDocCount++;
        }
      }
      return { phaseCount, activityCount, stakeholderCount, projectDocCount };
    });
    revalidatePath(`/projects/${targetProjectId}`, "layout");
    revalidatePath("/");
    return result;
  });
}

// ---------------------------------------------------------------------------
// User management (admin only, logged to admin_audit)
// ---------------------------------------------------------------------------

const accessInput = z.object({
  userId: z.uuid(),
  role: z.enum(userRole.enumValues).nullable(),
  status: z.enum(userStatus.enumValues),
});

export async function setUserAccess(input: z.input<typeof accessInput>) {
  return runAction(async () => {
    const admin = await requireUser("admin");
    const { userId, role, status } = accessInput.parse(input);
    if (status === "active" && !role) throw new UserError("Kies een rol om de gebruiker te activeren.");

    await db.transaction(async (tx) => {
      const [target] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
      if (!target) throw new UserError("Gebruiker niet gevonden.");
      const losesAdmin = target.role === "admin" && target.status === "active" && (role !== "admin" || status !== "active");
      if (losesAdmin) {
        const others = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, "admin"), eq(users.status, "active"), ne(users.id, userId)));
        if (others.length === 0) throw new UserError("Er moet minimaal één actieve admin overblijven.");
      }
      await tx.update(users).set({ role, status }).where(eq(users.id, userId));
      await tx.insert(adminAudit).values({
        actorId: admin.id,
        targetUserId: userId,
        action: "access_changed",
        details: { from: { role: target.role, status: target.status }, to: { role, status } },
      });
    });
    revalidatePath("/admin/users");
  });
}
