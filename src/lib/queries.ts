import { and, asc, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  activities,
  activityConflicts,
  comments,
  docFiles,
  docLinks,
  phases,
  projects,
  stakeholders,
  users,
  type Activity,
  type Phase,
  type Project,
} from "@/db/schema";
import { UserError } from "@/lib/action";
import { NotFoundError } from "@/lib/history";
import { isActivityComplete } from "@/lib/labels";

// ---------------------------------------------------------------------------
// Progress: a phase is complete when all its activities are done / not applicable.
// ---------------------------------------------------------------------------

export interface PhaseProgress {
  phase: Phase;
  total: number;
  complete: number;
  isComplete: boolean;
}

/** Progress per phase; a phase without activities counts as complete. */
export function phaseProgress(phaseList: Phase[], activityList: Activity[]): PhaseProgress[] {
  return phaseList.map((phase) => {
    const own = activityList.filter((a) => a.phaseId === phase.id);
    const complete = own.filter((a) => isActivityComplete(a.status)).length;
    return { phase, total: own.length, complete, isComplete: complete === own.length };
  });
}

export function projectProgress(activityList: Activity[]) {
  const total = activityList.length;
  const complete = activityList.filter((a) => isActivityComplete(a.status)).length;
  return { total, complete, percent: total === 0 ? 0 : Math.round((complete / total) * 100) };
}

/** For the "earlier phase still open" warning: is any phase before `phaseId` incomplete? */
function earlierIncomplete(phaseList: Phase[], activityList: Activity[], phaseId: string) {
  const progress = phaseProgress(phaseList, activityList);
  const index = progress.findIndex((p) => p.phase.id === phaseId);
  return progress.slice(0, Math.max(index, 0)).some((p) => !p.isComplete);
}

async function projectPhases(projectId: string) {
  return db
    .select()
    .from(phases)
    .where(and(eq(phases.projectId, projectId), isNull(phases.deletedAt)))
    .orderBy(asc(phases.sortOrder), asc(phases.createdAt));
}

async function projectActivities(projectId: string) {
  return db
    .select()
    .from(activities)
    .where(and(eq(activities.projectId, projectId), isNull(activities.deletedAt)))
    .orderBy(asc(activities.sortOrder), asc(activities.createdAt));
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function listProjects(opts: { includeArchived: boolean }) {
  const projectRows = await db
    .select()
    .from(projects)
    .where(and(isNull(projects.deletedAt), opts.includeArchived ? undefined : ne(projects.status, "archived")))
    .orderBy(asc(projects.name));
  if (projectRows.length === 0) return [];
  const ids = projectRows.map((p) => p.id);
  const phaseRows = await db
    .select()
    .from(phases)
    .where(and(inArray(phases.projectId, ids), isNull(phases.deletedAt)))
    .orderBy(asc(phases.sortOrder));
  const activityRows = await db
    .select()
    .from(activities)
    .where(and(inArray(activities.projectId, ids), isNull(activities.deletedAt)));

  return projectRows.map((project) => {
    const ownPhases = phaseRows.filter((p) => p.projectId === project.id);
    const own = activityRows.filter((a) => a.projectId === project.id);
    const progress = projectProgress(own);
    const currentPhase = phaseProgress(ownPhases, own).find((p) => !p.isComplete)?.phase ?? null;
    return { project, progress, currentPhase, phaseCount: ownPhases.length };
  });
}

export async function getProject(id: string): Promise<Project> {
  const [project] = await db.select().from(projects).where(and(eq(projects.id, id), isNull(projects.deletedAt)));
  if (!project) throw new NotFoundError("Project niet gevonden.");
  return project;
}

// ---------------------------------------------------------------------------
// Stakeholder rows with documentation and "Let op" counts (for tables)
// ---------------------------------------------------------------------------

/** Stakeholders matching `where`, each with its documentation (metadata) and warning count. */
async function stakeholderRows(projectId: string, where: SQL | undefined) {
  const rows = await db
    .select()
    .from(stakeholders)
    .where(and(eq(stakeholders.projectId, projectId), isNull(stakeholders.deletedAt), where))
    .orderBy(asc(stakeholders.sortOrder), asc(stakeholders.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((s) => s.id);
  const linkRows = await db
    .select({ id: docLinks.id, sid: docLinks.stakeholderId, title: docLinks.title, url: docLinks.url, description: docLinks.description })
    .from(docLinks)
    .where(and(inArray(docLinks.stakeholderId, ids), isNull(docLinks.deletedAt)))
    .orderBy(asc(docLinks.createdAt));
  const fileRows = await db
    .select({ id: docFiles.id, sid: docFiles.stakeholderId, filename: docFiles.filename, size: docFiles.size })
    .from(docFiles)
    .where(and(inArray(docFiles.stakeholderId, ids), isNull(docFiles.deletedAt)))
    .orderBy(asc(docFiles.createdAt));
  // Comment labels per stakeholder, shown as badges in the stakeholder list.
  const labelRows = await db
    .select({ sid: comments.stakeholderId, labels: comments.labels })
    .from(comments)
    .where(and(inArray(comments.stakeholderId, ids), isNull(comments.deletedAt), sql`cardinality(${comments.labels}) > 0`));
  return rows.map((s) => {
    const links = linkRows.filter((l) => l.sid === s.id);
    const files = fileRows.filter((f) => f.sid === s.id);
    const labelCounts: Record<string, number> = {};
    for (const r of labelRows) {
      if (r.sid !== s.id) continue;
      for (const key of new Set(r.labels)) labelCounts[key] = (labelCounts[key] ?? 0) + 1;
    }
    return { ...s, links, files, docCount: links.length + files.length, labelCounts };
  });
}

export type StakeholderRowData = Awaited<ReturnType<typeof stakeholderRows>>[number];

// ---------------------------------------------------------------------------
// Overview: phases with activities
// ---------------------------------------------------------------------------

export async function getProjectBoard(id: string) {
  const project = await getProject(id);
  const phaseRows = await projectPhases(id);
  const activityRows = await projectActivities(id);
  const phaseComments = await commentsFor({ projectId: id, kind: "phase" });

  // Stakeholder counts per activity, unassigned per phase, and "Let op" flags.
  const counts = await db
    .select({
      activityId: stakeholders.activityId,
      phaseId: stakeholders.phaseId,
      role: stakeholders.role,
      n: sql<number>`count(*)::int`,
    })
    .from(stakeholders)
    .where(and(eq(stakeholders.projectId, id), isNull(stakeholders.deletedAt)))
    .groupBy(stakeholders.activityId, stakeholders.phaseId, stakeholders.role);
  // Comment labels per activity: from the activity's own comments and from its stakeholders' comments.
  const labelRows = await db
    .select({
      activityId: sql<string | null>`coalesce(${comments.activityId}, ${stakeholders.activityId})`,
      labels: comments.labels,
    })
    .from(comments)
    .leftJoin(stakeholders, and(eq(stakeholders.id, comments.stakeholderId), isNull(stakeholders.deletedAt)))
    .where(
      and(
        eq(comments.projectId, id),
        isNull(comments.deletedAt),
        sql`cardinality(${comments.labels}) > 0`,
        sql`(${comments.activityId} is not null or ${stakeholders.activityId} is not null)`,
      ),
    );
  const labelCountsOf = (activityId: string) => {
    const out: Record<string, number> = {};
    for (const r of labelRows) {
      if (r.activityId !== activityId) continue;
      for (const key of new Set(r.labels)) out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  };

  const count = (activityId: string, role: "lead" | "involved") =>
    counts.find((c) => c.activityId === activityId && c.role === role)?.n ?? 0;

  return {
    project,
    phases: phaseProgress(phaseRows, activityRows).map((p) => ({
      ...p,
      activities: activityRows
        .filter((a) => a.phaseId === p.phase.id)
        .map((a) => ({
          ...a,
          leadCount: count(a.id, "lead"),
          involvedCount: count(a.id, "involved"),
          labelCounts: labelCountsOf(a.id),
        })),
      unassignedCount: counts
        .filter((c) => c.activityId === null && c.phaseId === p.phase.id)
        .reduce((n, c) => n + c.n, 0),
      comments: phaseComments.filter((c) => c.phaseId === p.phase.id),
    })),
    progress: projectProgress(activityRows),
  };
}

// ---------------------------------------------------------------------------
// Activity page
// ---------------------------------------------------------------------------

export async function getActivityDetail(projectId: string, activityId: string) {
  const project = await getProject(projectId);
  const [activity] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.projectId, projectId), isNull(activities.deletedAt)));
  if (!activity) throw new NotFoundError("Activiteit niet gevonden.");
  const phaseRows = await projectPhases(projectId);
  const activityRows = await projectActivities(projectId);
  const [changedBy] = activity.statusChangedBy
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, activity.statusChangedBy))
    : [];

  // Previous / next activity in overview order (phase order, then activity order).
  const ordered = phaseRows.flatMap((ph) => activityRows.filter((a) => a.phaseId === ph.id));
  const at = ordered.findIndex((a) => a.id === activity.id);

  return {
    project,
    activity,
    phase: phaseRows.find((p) => p.id === activity.phaseId)!,
    phases: phaseRows,
    earlierPhaseIncomplete: earlierIncomplete(phaseRows, activityRows, activity.phaseId),
    stakeholders: await stakeholderRows(projectId, eq(stakeholders.activityId, activity.id)),
    existingStakeholders: await existingStakeholderOptions(projectId, activity.id, activityRows),
    comments: await commentsFor({ activityId: activity.id, kind: "activity" }),
    conflicts: await db
      .select()
      .from(activityConflicts)
      .where(and(eq(activityConflicts.activityId, activity.id), isNull(activityConflicts.deletedAt)))
      .orderBy(asc(activityConflicts.sortOrder), asc(activityConflicts.createdAt)),
    statusChangedByName: changedBy?.name ?? null,
    previous: at > 0 ? ordered[at - 1] : null,
    next: at >= 0 && at < ordered.length - 1 ? ordered[at + 1] : null,
  };
}

/**
 * Stakeholders elsewhere in the project that can be linked to this activity too: one option per name
 * (not yet in this activity), using the row with the most contact details as the source.
 */
async function existingStakeholderOptions(projectId: string, activityId: string, activityRows: Activity[]) {
  const rows = await db
    .select()
    .from(stakeholders)
    .where(and(eq(stakeholders.projectId, projectId), isNull(stakeholders.deletedAt)));
  const inThisActivity = new Set(rows.filter((r) => r.activityId === activityId).map((r) => r.name));
  const filled = (r: (typeof rows)[number]) =>
    [r.contactPerson, r.email, r.phone, r.description, r.profile].filter(Boolean).length;
  const byName = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) {
    if (inThisActivity.has(r.name)) continue;
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name)!.push(r);
  }
  const numberOf = new Map(activityRows.map((a) => [a.id, a.number || a.name]));
  return [...byName.entries()]
    .map(([name, list]) => {
      const source = [...list].sort((a, b) => filled(b) - filled(a) || b.updatedAt.getTime() - a.updatedAt.getTime())[0];
      const where = [...new Set(list.map((r) => (r.activityId ? numberOf.get(r.activityId) : null)).filter(Boolean))] as string[];
      return { id: source.id, name, contactPerson: source.contactPerson, activities: where.sort((a, b) => a.localeCompare(b, "nl", { numeric: true })) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

export type ExistingStakeholderOption = Awaited<ReturnType<typeof existingStakeholderOptions>>[number];

/** Stakeholders of a phase that are not linked to an activity (created before activities existed). */
export async function getUnassignedStakeholders(projectId: string, phaseId: string) {
  const project = await getProject(projectId);
  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.id, phaseId), eq(phases.projectId, projectId), isNull(phases.deletedAt)));
  if (!phase) throw new NotFoundError("Fase niet gevonden.");
  const phaseRows = await projectPhases(projectId);
  const activityRows = await projectActivities(projectId);
  return {
    project,
    phase,
    stakeholders: await stakeholderRows(projectId, and(eq(stakeholders.phaseId, phaseId), isNull(stakeholders.activityId))),
    activityOptions: phaseRows.flatMap((ph) =>
      activityRows.filter((a) => a.phaseId === ph.id).map((a) => ({ id: a.id, label: `${ph.name} › ${a.number} ${a.name}`.trim() })),
    ),
  };
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export type CommentView = Awaited<ReturnType<typeof commentsFor>>[number];

export async function commentsFor(
  target:
    | { projectId: string; kind: "phase" }
    | { activityId: string; kind: "activity" }
    | { stakeholderId: string; kind: "stakeholder" },
) {
  const where =
    target.kind === "phase"
      ? and(eq(comments.projectId, target.projectId), isNotNull(comments.phaseId))
      : target.kind === "activity"
        ? eq(comments.activityId, target.activityId)
        : eq(comments.stakeholderId, target.stakeholderId);
  const rows = await db
    .select({ comment: comments, authorName: users.name })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(and(where, isNull(comments.deletedAt)))
    .orderBy(asc(comments.createdAt));
  return rows.map((r) => ({ ...r.comment, authorName: r.authorName ?? "Onbekend" }));
}

// ---------------------------------------------------------------------------
// Stakeholder page
// ---------------------------------------------------------------------------

export async function getStakeholderDetail(projectId: string, stakeholderId: string) {
  const project = await getProject(projectId);
  const [stakeholder] = await db
    .select()
    .from(stakeholders)
    .where(and(eq(stakeholders.id, stakeholderId), eq(stakeholders.projectId, projectId), isNull(stakeholders.deletedAt)));
  if (!stakeholder) throw new NotFoundError("Stakeholder niet gevonden.");
  const phaseRows = await projectPhases(projectId);
  const activityRows = await projectActivities(projectId);
  const links = await db
    .select()
    .from(docLinks)
    .where(and(eq(docLinks.stakeholderId, stakeholderId), isNull(docLinks.deletedAt)))
    .orderBy(asc(docLinks.createdAt));
  const files = await db
    .select()
    .from(docFiles)
    .where(and(eq(docFiles.stakeholderId, stakeholderId), isNull(docFiles.deletedAt)))
    .orderBy(asc(docFiles.createdAt));
  const [changedBy] = stakeholder.statusChangedBy
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, stakeholder.statusChangedBy))
    : [];
  return {
    project,
    stakeholder,
    phase: phaseRows.find((p) => p.id === stakeholder.phaseId),
    activity: activityRows.find((a) => a.id === stakeholder.activityId) ?? null,
    activityOptions: phaseRows.flatMap((ph) =>
      activityRows.filter((a) => a.phaseId === ph.id).map((a) => ({ id: a.id, label: `${ph.name} › ${a.number} ${a.name}`.trim() })),
    ),
    earlierPhaseIncomplete: earlierIncomplete(phaseRows, activityRows, stakeholder.phaseId),
    links,
    files,
    comments: await commentsFor({ stakeholderId, kind: "stakeholder" }),
    statusChangedByName: changedBy?.name ?? null,
  };
}

/** Throws when the project is missing, deleted or archived (archived = read-only). */
export async function assertProjectWritable(tx: Tx, projectId: string) {
  const [project] = await tx.select().from(projects).where(eq(projects.id, projectId));
  if (!project || project.deletedAt) throw new NotFoundError("Project niet gevonden.");
  if (project.status === "archived") {
    throw new UserError("Dit project is gearchiveerd en kan niet worden gewijzigd.");
  }
  return project;
}
