/**
 * Helpers for the SQL generators in scripts/. History snapshots must have exactly the shape the app
 * writes (JSON of a Drizzle row: camelCase keys, ISO-8601 UTC timestamps), otherwise restoring a
 * project would see differences that are not there. Keep these in sync with src/db/schema.ts.
 */

/** SQL string literal. */
export const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Timestamp column as the app serialises it (JSON of a JS Date), or NULL. */
export const iso = (col: string) =>
  `CASE WHEN ${col} IS NULL THEN NULL ELSE to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END`;

const meta = (a: string) =>
  `'version', ${a}.version, 'deletedAt', ${iso(`${a}.deleted_at`)}, 'createdAt', ${iso(`${a}.created_at`)}, 'updatedAt', ${iso(`${a}.updated_at`)}`;

export const snapshot = {
  project: (a: string) => `jsonb_build_object(
    'id', ${a}.id, 'name', ${a}.name, 'description', ${a}.description, 'status', ${a}.status,
    'startDate', ${a}.start_date, 'endDate', ${a}.end_date, 'leaderName', ${a}.leader_name, 'leaderEmail', ${a}.leader_email,
    ${meta(a)})`,
  phase: (a: string) => `jsonb_build_object(
    'id', ${a}.id, 'projectId', ${a}.project_id, 'name', ${a}.name, 'description', ${a}.description, 'sortOrder', ${a}.sort_order,
    ${meta(a)})`,
  activity: (a: string) => `jsonb_build_object(
    'id', ${a}.id, 'projectId', ${a}.project_id, 'phaseId', ${a}.phase_id, 'number', ${a}.number, 'name', ${a}.name,
    'description', ${a}.description, 'result', ${a}.result, 'status', ${a}.status,
    'statusChangedBy', ${a}.status_changed_by, 'statusChangedAt', ${iso(`${a}.status_changed_at`)}, 'sortOrder', ${a}.sort_order,
    ${meta(a)})`,
  activity_conflict: (a: string) => `jsonb_build_object(
    'id', ${a}.id, 'projectId', ${a}.project_id, 'activityId', ${a}.activity_id, 'conflictNumber', ${a}.conflict_number,
    'title', ${a}.title, 'theme', ${a}.theme, 'severity', ${a}.severity, 'sideA', ${a}.side_a, 'sideB', ${a}.side_b,
    'why', ${a}.why, 'solutions', ${a}.solutions, 'sortOrder', ${a}.sort_order,
    ${meta(a)})`,
  stakeholder: (a: string) => `jsonb_build_object(
    'id', ${a}.id, 'projectId', ${a}.project_id, 'phaseId', ${a}.phase_id, 'activityId', ${a}.activity_id, 'role', ${a}.role,
    'sortOrder', ${a}.sort_order, 'name', ${a}.name, 'contactPerson', ${a}.contact_person, 'email', ${a}.email,
    'phone', ${a}.phone, 'description', ${a}.description, 'deadline', ${a}.deadline, 'activities', ${a}.activities,
    'interests', ${a}.interests, 'profile', ${a}.profile, 'status', ${a}.status, 'statusChangedBy', ${a}.status_changed_by,
    'statusChangedAt', ${iso(`${a}.status_changed_at`)},
    ${meta(a)})`,
  doc_link: (a: string) => `jsonb_build_object(
    'id', ${a}.id, 'projectId', ${a}.project_id, 'stakeholderId', ${a}.stakeholder_id, 'title', ${a}.title, 'url', ${a}.url,
    'description', ${a}.description, 'createdBy', ${a}.created_by,
    ${meta(a)})`,
  doc_file: (a: string) => `jsonb_build_object(
    'id', ${a}.id, 'projectId', ${a}.project_id, 'stakeholderId', ${a}.stakeholder_id, 'blobId', ${a}.blob_id,
    'filename', ${a}.filename, 'mimeType', ${a}.mime_type, 'size', ${a}.size, 'createdBy', ${a}.created_by,
    ${meta(a)})`,
  comment: (a: string) => `jsonb_build_object(
    'id', ${a}.id, 'projectId', ${a}.project_id, 'phaseId', ${a}.phase_id, 'activityId', ${a}.activity_id,
    'stakeholderId', ${a}.stakeholder_id, 'authorId', ${a}.author_id, 'body', ${a}.body, 'labels', to_jsonb(${a}.labels), 'editedAt', ${iso(`${a}.edited_at`)},
    ${meta(a)})`,
};

/**
 * SQL that creates a temp table `import_ctx` (one batch id + the first active admin as actor),
 * so every history event of a script run is grouped as one change.
 */
export const importContext = `CREATE TEMP TABLE import_ctx ON COMMIT DROP AS
SELECT gen_random_uuid() AS batch_id,
       (SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at LIMIT 1) AS actor_id;`;
