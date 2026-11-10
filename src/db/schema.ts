import { sql } from "drizzle-orm";
import {
  bigserial,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ---------------------------------------------------------------------------
// Users & roles
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["admin", "editor", "viewer"]);
export const userStatus = pgEnum("user_status", ["pending", "active", "deactivated"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    // Entra object id: stable identity within a tenant.
    oid: text("oid").notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRole("role"),
    status: userStatus("status").notNull().default("pending"),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastLoginAt: ts("last_login_at"),
  },
  (t) => [uniqueIndex("users_tenant_oid_idx").on(t.tenantId, t.oid)],
);

/** Admin-only audit log for user management (separate from project history). */
export const adminAudit = pgTable("admin_audit", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: uuid("actor_id").references(() => users.id),
  targetUserId: uuid("target_user_id").references(() => users.id),
  action: text("action").notNull(),
  details: jsonb("details"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Checklist domain. Every versioned table has: version, deletedAt, projectId.
// ---------------------------------------------------------------------------

export const projectStatus = pgEnum("project_status", ["active", "on_hold", "completed", "archived"]);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: projectStatus("status").notNull().default("active"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  leaderName: text("leader_name").notNull().default(""),
  leaderEmail: text("leader_email").notNull().default(""),
  version: integer("version").notNull().default(1),
  deletedAt: ts("deleted_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const phases = pgTable(
  "phases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    version: integer("version").notNull().default(1),
    deletedAt: ts("deleted_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("phases_project_idx").on(t.projectId)],
);

export const activityStatus = pgEnum("activity_status", ["not_started", "in_progress", "done", "not_applicable"]);

/** A step within a phase (e.g. "1.2 Planologische mogelijkheden controleren"). */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    phaseId: uuid("phase_id").notNull().references(() => phases.id),
    /** Free-form number such as "1.2". */
    number: text("number").notNull().default(""),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** Expected result ("Resultaat"). */
    result: text("result").notNull().default(""),
    status: activityStatus("status").notNull().default("not_started"),
    statusChangedBy: uuid("status_changed_by").references(() => users.id),
    statusChangedAt: ts("status_changed_at"),
    sortOrder: integer("sort_order").notNull().default(0),
    version: integer("version").notNull().default(1),
    deletedAt: ts("deleted_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("activities_project_idx").on(t.projectId), index("activities_phase_idx").on(t.phaseId)],
);

/** A conflict of interests that plays in an activity ("Belangenverstrengeling per fase"). */
export const activityConflicts = pgTable(
  "activity_conflicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    /** Number in the source conflicts list ("Conflict nr."), if any. */
    conflictNumber: integer("conflict_number"),
    title: text("title").notNull(),
    theme: text("theme").notNull().default(""),
    /** "Hoog" / "Middel" / "Laag" (free text as in the source). */
    severity: text("severity").notNull().default(""),
    sideA: text("side_a").notNull().default(""),
    sideB: text("side_b").notNull().default(""),
    /** Why the interests clash ("Waarom botsen de belangen?"). */
    why: text("why").notNull().default(""),
    solutions: text("solutions").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    version: integer("version").notNull().default(1),
    deletedAt: ts("deleted_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("activity_conflicts_activity_idx").on(t.activityId)],
);

export const stakeholderStatus = pgEnum("stakeholder_status", [
  "not_started",
  "contacted",
  "awaiting_response",
  "done",
  "not_applicable",
]);

/** Role of a stakeholder within its activity: leading ("Leidend") or involved ("Ook betrokken"). */
export const stakeholderRole = pgEnum("stakeholder_role", ["lead", "involved"]);

export const stakeholders = pgTable(
  "stakeholders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    /** Always the phase of the activity (kept for queries and for stakeholders without activity). */
    phaseId: uuid("phase_id").notNull().references(() => phases.id),
    /** Null only for stakeholders created before activities existed ("zonder activiteit"). */
    activityId: uuid("activity_id").references(() => activities.id),
    role: stakeholderRole("role").notNull().default("involved"),
    sortOrder: integer("sort_order").notNull().default(0),
    name: text("name").notNull(),
    contactPerson: text("contact_person").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    description: text("description").notNull().default(""),
    deadline: date("deadline", { mode: "string" }),
    activities: text("activities").notNull().default(""),
    /** What this stakeholder wants: interests and requirements ("Belangen en eisen"). */
    interests: text("interests").notNull().default(""),
    /**
     * Background on this type of stakeholder (role, legal obligations, policy frameworks), e.g. from the
     * stakeholder Word document. Lines starting with "## " are sub-headings, "• " are list items.
     */
    profile: text("profile").notNull().default(""),
    status: stakeholderStatus("status").notNull().default("not_started"),
    statusChangedBy: uuid("status_changed_by").references(() => users.id),
    statusChangedAt: ts("status_changed_at"),
    version: integer("version").notNull().default(1),
    deletedAt: ts("deleted_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("stakeholders_project_idx").on(t.projectId),
    index("stakeholders_phase_idx").on(t.phaseId),
    index("stakeholders_activity_idx").on(t.activityId),
  ],
);

export const docLinks = pgTable(
  "doc_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    /** Null = general project document (project "Documenten" tab). */
    stakeholderId: uuid("stakeholder_id").references(() => stakeholders.id),
    title: text("title").notNull(),
    url: text("url").notNull(),
    description: text("description").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id),
    version: integer("version").notNull().default(1),
    deletedAt: ts("deleted_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("doc_links_stakeholder_idx").on(t.stakeholderId)],
);

/** Immutable file contents. Shared between doc_files rows (e.g. after copying a project). */
export const blobs = pgTable("blobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  data: bytea("data").notNull(),
  size: integer("size").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const docFiles = pgTable(
  "doc_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    /** Null = general project document (project "Documenten" tab). */
    stakeholderId: uuid("stakeholder_id").references(() => stakeholders.id),
    blobId: uuid("blob_id").notNull().references(() => blobs.id),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    version: integer("version").notNull().default(1),
    deletedAt: ts("deleted_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("doc_files_stakeholder_idx").on(t.stakeholderId)],
);

/** A comment belongs to a phase, an activity or a stakeholder (exactly one is set). */
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    phaseId: uuid("phase_id").references(() => phases.id),
    activityId: uuid("activity_id").references(() => activities.id),
    stakeholderId: uuid("stakeholder_id").references(() => stakeholders.id),
    authorId: uuid("author_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    /** Label keys, e.g. ["pas_op"]; definitions in src/lib/labels.ts (COMMENT_LABELS). */
    labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
    editedAt: ts("edited_at"),
    version: integer("version").notNull().default(1),
    deletedAt: ts("deleted_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("comments_phase_idx").on(t.phaseId), index("comments_stakeholder_idx").on(t.stakeholderId)],
);

// ---------------------------------------------------------------------------
// History: one append-only event per change, with full before/after snapshots.
// ---------------------------------------------------------------------------

export const historyOp = pgEnum("history_op", ["create", "update", "delete", "restore"]);

export const historyEvents = pgTable(
  "history_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    projectId: uuid("project_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    op: historyOp("op").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    actorId: uuid("actor_id").references(() => users.id),
    /** Events written by one user action share a batch id. */
    batchId: uuid("batch_id").notNull(),
    /** Human readable description of the action, e.g. "Teruggedraaid: wijziging #12". */
    note: text("note"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("history_project_idx").on(t.projectId, t.createdAt),
    index("history_entity_idx").on(t.entityType, t.entityId),
  ],
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Phase = typeof phases.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type ActivityConflict = typeof activityConflicts.$inferSelect;
export type ActivityStatus = (typeof activityStatus.enumValues)[number];
export type StakeholderRole = (typeof stakeholderRole.enumValues)[number];
export type Stakeholder = typeof stakeholders.$inferSelect;
export type DocLink = typeof docLinks.$inferSelect;
export type DocFile = typeof docFiles.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type HistoryEvent = typeof historyEvents.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];
export type StakeholderStatus = (typeof stakeholderStatus.enumValues)[number];
export type ProjectStatus = (typeof projectStatus.enumValues)[number];
