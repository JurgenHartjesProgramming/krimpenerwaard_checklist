# Krimpenerwaard Checklist — Specification

Status: agreed with product owner on 2026-11-09.

A web application to track, per project, which stakeholders must be contacted in which phase.
The UI language is **Dutch**; code, comments and documentation are **English**.

## 1. Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript |
| Auth | Auth.js (NextAuth v5) with Microsoft Entra ID provider |
| Database | PostgreSQL, accessed through Drizzle ORM with SQL migrations |
| UI | Tailwind CSS (+ shadcn/ui-style components) |
| Local infra | `docker-compose.yml` running Postgres |
| Hosting | Undecided — local only for now. App must be containerisable. |

## 2. Authentication

- One **multi-tenant** Entra ID app registration.
- Sign-in is accepted only if the token's tenant id (`tid` claim) is in the env var
  `ALLOWED_TENANT_IDS` (comma separated). Production: only the Krimpenerwaard tenant.
  Test: additionally the developer's tenant. Checks are on **tenant id, not e-mail domain**.
- **Development login** (changed 2026-11-09, because no Entra tenant was available for testing):
  fixed test users per role, only registered when `NODE_ENV=development`; absent from production builds.
- First sign-in creates a user with status **pending** (no access). An admin approves and assigns a role.
- The e-mail in `INITIAL_ADMIN_EMAIL` becomes an active admin on first sign-in.
- `.env` is validated at start-up and by `npm run check-env`; see `docs/SETUP.md`.

## 3. Roles (application-wide)

| Action | Admin | Editor | Viewer |
|---|---|---|---|
| Create / archive / delete projects | ✅ | ❌ | ❌ |
| Copy from another project | ✅ | ❌ | ❌ |
| Add / edit phases and stakeholders | ✅ | ✅ | ❌ |
| Change status | ✅ | ✅ | ❌ |
| Post comments | ✅ | ✅ | ❌ |
| Add documentation (links, files) | ✅ | ✅ | ❌ |
| Restore versions | ✅ | ❌ | ❌ |
| Manage users and roles | ✅ | ❌ | ❌ |
| View everything (incl. history timeline) | ✅ | ✅ | ✅ |

Users can be **deactivated**, never deleted (their name stays on history and comments).

## 4. Domain model

### Project
- name (required), description, status (`active` | `on_hold` | `completed` | `archived`),
  start date, end date, project leader (free text name + optional e-mail; label only).
- Archived projects are hidden by default and read-only.

Structure (changed 2026-11-10): **project → phase → activity → stakeholders**.

### Phase (belongs to project)
- name, description, sort order (drag to reorder), comments, collapsible on the overview.
- Phases are **not locked**: work may happen in any phase. When changing a status while an earlier
  phase is not complete, the UI shows a **warning** (no block).
- A phase is complete when all its activities are `done` or `not_applicable`.

### Activity (belongs to phase)
- number (e.g. "1.2"), name, description, result, sort order (drag to reorder or to move to another phase).
- Status: `not_started` → `in_progress` → `done`, plus `not_applicable`; progress is counted on activities.
- The overview shows only phases and activities; clicking an activity opens its page with its stakeholders.

- Each activity can list **conflicts of interest** (title, severity, theme, side A / side B, why the
  interests clash, possible solutions), shown under its description and result; editable and versioned.

### Stakeholder (belongs to one activity; separate rows per activity)
- Name, contact details, deadline and description are edited in a **pop-up** (pencil in the stakeholder
  list of an activity, or on the stakeholder page).
- The stakeholder page shows **"Over deze stakeholder"** (`profile`: role, legal obligations, policy frameworks,
  e.g. from the stakeholder Word document), the activity log, documentation and comments.
- "Belangen en eisen" (`interests`) is no longer shown (2026-11-10); the column and its data are kept.
- In the stakeholder list every comment label used on that stakeholder is shown as a badge (with a count).
- Role in the activity: **Leidend** (`lead`) or **Ook betrokken** (`involved`); drag between the two groups.
- The same party in two activities is two independent rows (own status, documentation, comments).
- "Stakeholder toevoegen" offers: link an **existing** stakeholder of the project (creates a row for this activity
  with the same name, contact details, background and copies of its documentation; status/deadline/comments start
  empty) or create a **new** one.
- Rows from before activities existed have no activity; they are listed per phase as
  "stakeholders zonder activiteit" and can be linked to an activity.
- name/organisation (required), contact person, e-mail, phone, description, deadline,
  activities (large free text, versioned), **interests and requirements** ("Belangen en eisen", free text,
  versioned), status, status changed by / at.
- On the activity page each stakeholder row can be expanded to show its interests/requirements (editable
  inline) and its documentation.
- Status: `not_started` → `contacted` → `awaiting_response` → `done`, plus `not_applicable`.
- Documentation: links (title, URL, description) and files.
- Comments.

### Project documents
- Each project has a **Documenten** tab with general documents (links and files) not tied to a stakeholder
  (stored with `stakeholder_id = NULL`), plus a read-only overview of all stakeholder documentation.
- Copying from another project can optionally include these project documents.

### Documentation files
- Stored in Postgres (`bytea`) behind a storage interface so it can move to blob storage later.
- Max 25 MB per file. Allowed: pdf, docx, xlsx, pptx, images, msg/eml, txt.
- Soft delete. When copied to another project the blob is shared (not duplicated).

### Comments (on phase, activity and stakeholder)
- Flat list, oldest first, plain text with auto-linked URLs, shows author/time/"bewerkt".
- Author may edit/delete own comments; admin may edit/delete all. Fully versioned.
- No mentions, no reactions, no attachments, **no e-mail notifications at all**.

## 5. Copying from another project (admin only)

- Admin selects a source project and which phases / activities to copy.
- An activity is copied with all its stakeholders (role, fields, interests) and their documentation.
- Optional checkboxes: include comments; include project documents.
- Never copied: status (reset to `not_started`).
- Activities copied into an existing phase with the same name are appended to it.

## 6. Version history

- Every change (projects, phases, stakeholders, comments, documentation, activities) is written
  as an **event** to a history table: who, when, entity, operation, before, after.
- Admin can **revert a single change** or **restore a project to a point in time**.
  A revert/restore is itself recorded as new events — history is never rewritten.
- All deletes are **soft deletes**.
- Everyone can view the per-project timeline; only admins can restore.
- User / role changes are logged in a separate admin-only audit log.
- History is never pruned.

## 7. Concurrency

Optimistic locking: every editable row has a `version` integer. Saving with a stale version
fails with a conflict message showing who changed it; the user re-applies their change.

## 8. Overview and export

- Home: list of projects with progress (% activities `done`/`not_applicable`) and current phase
  (first incomplete phase), filter by project status, search by name.
- Excel export per project: one row per stakeholder with its phase, activity (number, name, status,
  description, result) and role; activities without stakeholders get one row.

## 9. Out of scope (for now)

PDF reports, Excel import, e-mail notifications, mentions, per-project permissions,
live co-editing, hosting/deployment setup.
