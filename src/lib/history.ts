/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Versioned persistence layer.
 *
 * Every mutation of a checklist entity MUST go through this module. Each change is
 * written as an append-only event in `history_events` with full before/after snapshots,
 * which powers the timeline, single-change revert and point-in-time project restore.
 *
 * Rules:
 * - Rows are never hard-deleted; `deletedAt` is set instead.
 * - Every row has a `version` that is bumped on each write (optimistic locking).
 * - Reverts/restores are themselves new events; history is never rewritten.
 */
import { and, asc, desc, eq, getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db, Tx } from "@/db";
import { activities, activityConflicts, comments, docFiles, docLinks, historyEvents, phases, projects, stakeholders, users } from "@/db/schema";

export const entityTables = {
  project: projects,
  phase: phases,
  activity: activities,
  activity_conflict: activityConflicts,
  stakeholder: stakeholders,
  doc_link: docLinks,
  doc_file: docFiles,
  comment: comments,
} as const;

export type EntityType = keyof typeof entityTables;

/** Fields that are bookkeeping, not content: ignored when diffing and restoring. */
const META_FIELDS = new Set(["id", "version", "createdAt", "updatedAt"]);

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Niet gevonden") {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface WriteContext {
  actorId: string;
  batchId: string;
  note?: string;
}

export function newBatch(actorId: string, note?: string): WriteContext {
  return { actorId, batchId: crypto.randomUUID(), note };
}

function table(type: EntityType): any {
  return entityTables[type] as PgTable;
}

function projectIdOf(type: EntityType, row: any): string {
  return type === "project" ? row.id : row.projectId;
}

/** JSON snapshot of a row (Dates become ISO strings, Buffers are never part of entity rows). */
function snapshot(row: any): Record<string, unknown> {
  return JSON.parse(JSON.stringify(row));
}

/** Convert snapshot values back to the shapes Drizzle expects (timestamp strings → Date). */
function hydrate(type: EntityType, values: Record<string, unknown>): Record<string, unknown> {
  const columns = getTableColumns(table(type)) as Record<string, any>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const col = columns[key];
    if (!col) continue;
    out[key] = col.columnType === "PgTimestamp" && typeof value === "string" ? new Date(value) : value;
  }
  return out;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Content fields that differ between two snapshots. */
export function changedFields(before: any, after: any): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((k) => !META_FIELDS.has(k) && !sameValue(before?.[k], after?.[k]));
}

async function recordEvent(
  tx: Tx,
  ctx: WriteContext,
  type: EntityType,
  op: "create" | "update" | "delete" | "restore",
  before: any,
  after: any,
) {
  const row = after ?? before;
  await tx.insert(historyEvents).values({
    projectId: projectIdOf(type, row),
    entityType: type,
    entityId: row.id,
    op,
    before: before ? snapshot(before) : null,
    after: after ? snapshot(after) : null,
    actorId: ctx.actorId,
    batchId: ctx.batchId,
    note: ctx.note,
  });
}

async function lockRow(tx: Tx, type: EntityType, id: string): Promise<any> {
  const t = table(type);
  const [row] = await (tx.select().from(t).where(eq(t.id, id)) as any).for("update");
  if (!row) throw new NotFoundError();
  return row;
}

async function conflictMessage(tx: Tx, type: EntityType, id: string): Promise<string> {
  const [last] = await tx
    .select({ name: users.name, at: historyEvents.createdAt })
    .from(historyEvents)
    .leftJoin(users, eq(users.id, historyEvents.actorId))
    .where(and(eq(historyEvents.entityType, type), eq(historyEvents.entityId, id)))
    .orderBy(desc(historyEvents.id))
    .limit(1);
  const who = last?.name ?? "iemand anders";
  const when = last?.at ? last.at.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" }) : "";
  return `Dit is intussen gewijzigd door ${who}${when ? ` (${when})` : ""}. Herlaad de pagina, bekijk de nieuwe versie en voer je wijziging opnieuw in.`;
}

// ---------------------------------------------------------------------------
// Public write API
// ---------------------------------------------------------------------------

export async function createEntity<T = any>(
  tx: Tx,
  ctx: WriteContext,
  type: EntityType,
  values: Record<string, unknown>,
): Promise<T> {
  const [row] = await tx.insert(table(type)).values(values).returning();
  await recordEvent(tx, ctx, type, "create", null, row);
  return row as T;
}

/**
 * Update an entity. Pass `expectedVersion` (from the form the user edited) to enable
 * optimistic locking; pass `null` only for internal writes that must not conflict.
 */
export async function updateEntity<T = any>(
  tx: Tx,
  ctx: WriteContext,
  type: EntityType,
  id: string,
  expectedVersion: number | null,
  patch: Record<string, unknown>,
): Promise<T> {
  const current = await lockRow(tx, type, id);
  if (current.deletedAt) throw new NotFoundError("Dit item is verwijderd.");
  if (expectedVersion !== null && current.version !== expectedVersion) {
    throw new ConflictError(await conflictMessage(tx, type, id));
  }
  const t = table(type);
  const [row] = await tx
    .update(t)
    .set({ ...patch, version: current.version + 1, updatedAt: new Date() })
    .where(eq(t.id, id))
    .returning();
  if (changedFields(current, row).length > 0) {
    await recordEvent(tx, ctx, type, "update", current, row);
  }
  return row as T;
}

export async function deleteEntity(
  tx: Tx,
  ctx: WriteContext,
  type: EntityType,
  id: string,
  expectedVersion: number | null,
): Promise<void> {
  const current = await lockRow(tx, type, id);
  if (current.deletedAt) return;
  if (expectedVersion !== null && current.version !== expectedVersion) {
    throw new ConflictError(await conflictMessage(tx, type, id));
  }
  const t = table(type);
  const [row] = await tx
    .update(t)
    .set({ deletedAt: new Date(), version: current.version + 1, updatedAt: new Date() })
    .where(eq(t.id, id))
    .returning();
  await recordEvent(tx, ctx, type, "delete", current, row);
}

/**
 * Bring an entity's content fields to `target` (a snapshot), or soft-delete it when
 * `target` is null. Recorded as a "restore" event. No-op when nothing changes.
 */
async function applySnapshot(tx: Tx, ctx: WriteContext, type: EntityType, id: string, target: any | null) {
  const current = await lockRow(tx, type, id);
  const desired = target === null ? { ...snapshot(current), deletedAt: current.deletedAt ?? new Date().toISOString() } : target;
  // Only restore fields the snapshot knows about: snapshots written before a column was
  // added (e.g. stakeholders.interests) must leave that column's current value alone.
  const fields = changedFields(snapshot(current), desired).filter((f) => f in desired);
  // Keep existing deletion timestamp semantics: only the presence of deletedAt matters.
  const effective = fields.filter((f) => f !== "deletedAt" || !!current.deletedAt !== !!desired.deletedAt);
  if (effective.length === 0) return false;
  const patch: Record<string, unknown> = {};
  for (const f of effective) patch[f] = desired[f] ?? null;
  const t = table(type);
  const [row] = await tx
    .update(t)
    .set({ ...hydrate(type, patch), version: current.version + 1, updatedAt: new Date() })
    .where(eq(t.id, id))
    .returning();
  await recordEvent(tx, ctx, type, "restore", current, row);
  return true;
}

/**
 * Revert one history event. Only the fields that event changed are put back, so
 * unrelated later edits on the same entity are preserved.
 */
export async function revertEvent(tx: Tx, ctx: WriteContext, eventId: number) {
  const [event] = await tx.select().from(historyEvents).where(eq(historyEvents.id, eventId));
  if (!event) throw new NotFoundError("Wijziging niet gevonden.");
  const type = event.entityType as EntityType;
  const current = snapshot(await lockRow(tx, type, event.entityId));
  const before = event.before as any;
  const after = event.after as any;

  if (event.op === "create") {
    // Undo a creation: soft-delete.
    return applySnapshot(tx, ctx, type, event.entityId, null);
  }
  const target = { ...current };
  for (const f of changedFields(before, after)) target[f] = before?.[f] ?? null;
  return applySnapshot(tx, ctx, type, event.entityId, target);
}

/**
 * Restore every entity of a project to its state at `at`. Entities that did not yet
 * exist at that moment are soft-deleted. Returns the number of entities changed.
 */
export async function restoreProjectTo(tx: Tx, ctx: WriteContext, projectId: string, at: Date) {
  const events = await tx
    .select()
    .from(historyEvents)
    .where(eq(historyEvents.projectId, projectId))
    .orderBy(asc(historyEvents.id));

  // Latest known state per entity at time `at` (undefined = did not exist yet).
  const stateAt = new Map<string, { type: EntityType; id: string; state: any | null }>();
  for (const e of events) {
    const key = `${e.entityType}:${e.entityId}`;
    if (!stateAt.has(key)) stateAt.set(key, { type: e.entityType as EntityType, id: e.entityId, state: null });
    if (e.createdAt <= at) stateAt.get(key)!.state = e.after;
  }

  // Parents first so that restored children never point at deleted parents.
  const order: EntityType[] = ["project", "phase", "activity", "activity_conflict", "stakeholder", "doc_link", "doc_file", "comment"];
  let changed = 0;
  for (const type of order) {
    for (const entry of stateAt.values()) {
      if (entry.type !== type) continue;
      if (await applySnapshot(tx, ctx, type, entry.id, entry.state)) changed++;
    }
  }
  return changed;
}

/** Events of a project, newest first (used by the timeline). */
export async function projectHistory(tx: Db | Tx, projectId: string, limit = 300) {
  return tx
    .select({
      event: historyEvents,
      actorName: users.name,
    })
    .from(historyEvents)
    .leftJoin(users, eq(users.id, historyEvents.actorId))
    .where(eq(historyEvents.projectId, projectId))
    .orderBy(desc(historyEvents.id))
    .limit(limit);
}

