/**
 * Smoke test for the versioned persistence layer against the local database.
 * Run: npx tsx scripts/smoke-history.ts
 * Creates its own throwaway user and project and removes them again at the end.
 * Use a development database only.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { historyEvents, phases, projects, stakeholders, users, type Project, type Phase, type Stakeholder } from "@/db/schema";
import {
  ConflictError,
  createEntity,
  deleteEntity,
  newBatch,
  restoreProjectTo,
  revertEvent,
  updateEntity,
} from "@/lib/history";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [user] = await db
    .insert(users)
    .values({ tenantId: "smoke", oid: crypto.randomUUID(), email: "smoke@test", name: "Smoke Test", status: "active", role: "admin" })
    .returning();
  const ctx = () => newBatch(user.id);

  const project = await db.transaction((tx) => createEntity<Project>(tx, ctx(), "project", { name: "Smoke project" }));
  const phase = await db.transaction((tx) =>
    createEntity<Phase>(tx, ctx(), "phase", { projectId: project.id, name: "Fase 1" }),
  );
  const s = await db.transaction((tx) =>
    createEntity<Stakeholder>(tx, ctx(), "stakeholder", { projectId: project.id, phaseId: phase.id, name: "Waterschap" }),
  );
  await sleep(50);
  const checkpoint = new Date();
  await sleep(50);

  // 1. Updates bump version; stale version conflicts.
  const s2 = await db.transaction((tx) =>
    updateEntity<Stakeholder>(tx, ctx(), "stakeholder", s.id, 1, { status: "contacted", activities: "Gebeld" }),
  );
  assert.equal(s2.version, 2);
  await assert.rejects(
    db.transaction((tx) => updateEntity(tx, ctx(), "stakeholder", s.id, 1, { activities: "oud" })),
    ConflictError,
  );
  console.log("✓ optimistic locking");

  // 2. Revert a single change only touches that change's fields.
  const s3 = await db.transaction((tx) =>
    updateEntity<Stakeholder>(tx, ctx(), "stakeholder", s.id, 2, { phone: "0612345678" }),
  );
  const [statusEvent] = await db
    .select()
    .from(historyEvents)
    .where(eq(historyEvents.entityId, s.id))
    .orderBy(historyEvents.id)
    .offset(1)
    .limit(1);
  await db.transaction((tx) => revertEvent(tx, ctx(), statusEvent.id));
  let [row] = await db.select().from(stakeholders).where(eq(stakeholders.id, s.id));
  assert.equal(row.status, "not_started");
  assert.equal(row.activities, "");
  assert.equal(row.phone, "0612345678", "later unrelated change must survive");
  assert.equal(row.version, s3.version + 1);
  console.log("✓ revert single change");

  // 3. Delete + revert delete = undelete.
  await db.transaction((tx) => deleteEntity(tx, ctx(), "stakeholder", s.id, row.version));
  [row] = await db.select().from(stakeholders).where(eq(stakeholders.id, s.id));
  assert.ok(row.deletedAt);
  const lastDelete = (await db.select().from(historyEvents).where(eq(historyEvents.entityId, s.id))).find(
    (e) => e.op === "delete",
  )!;
  await db.transaction((tx) => revertEvent(tx, ctx(), lastDelete.id));
  [row] = await db.select().from(stakeholders).where(eq(stakeholders.id, s.id));
  assert.equal(row.deletedAt, null);
  console.log("✓ soft delete + restore");

  // 4. Point-in-time restore: entity created after checkpoint disappears, fields go back.
  const later = await db.transaction((tx) =>
    createEntity<Stakeholder>(tx, ctx(), "stakeholder", { projectId: project.id, phaseId: phase.id, name: "Later" }),
  );
  await db.transaction((tx) => updateEntity(tx, ctx(), "project", project.id, null, { name: "Hernoemd" }));
  const changed = await db.transaction((tx) => restoreProjectTo(tx, ctx(), project.id, checkpoint));
  assert.ok(changed >= 2, `expected changes, got ${changed}`);
  const [laterRow] = await db.select().from(stakeholders).where(eq(stakeholders.id, later.id));
  assert.ok(laterRow.deletedAt, "entity created after checkpoint must be soft-deleted");
  [row] = await db.select().from(stakeholders).where(eq(stakeholders.id, s.id));
  assert.equal(row.phone, "", "fields must be back at checkpoint state");
  console.log(`✓ restore project to point in time (${changed} entities)`);

  // Cleanup: hard-delete everything this test created, so it leaves no trace in a dev database.
  await db.transaction(async (tx) => {
    await tx.delete(historyEvents).where(eq(historyEvents.projectId, project.id));
    await tx.delete(stakeholders).where(eq(stakeholders.projectId, project.id));
    await tx.delete(phases).where(eq(phases.projectId, project.id));
    await tx.delete(projects).where(eq(projects.id, project.id));
    await tx.delete(users).where(eq(users.id, user.id));
  });
  console.log("All history smoke tests passed (test data removed).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
