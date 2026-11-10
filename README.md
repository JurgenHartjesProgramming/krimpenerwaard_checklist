# Krimpenerwaard Checklist

Web application to track, per project, which stakeholders must be contacted in each phase.
Sign-in with Microsoft (Entra ID), role-based access, full version history with admin restore.

The full functional specification is in [docs/SPEC.md](docs/SPEC.md).

**Getting it running (database, template, Microsoft sign-in, production): see [docs/INSTALLATION.md](docs/INSTALLATION.md).**

## Stack

Next.js 15 (App Router) · TypeScript · Auth.js v5 (Microsoft Entra ID) · Drizzle ORM · PostgreSQL · Tailwind CSS v4

## Local development

Requirements: Node 20+, Docker Desktop.

```bash
cp .env.example .env          # then fill in the values: see docs/SETUP.md
npm install
npm run db:up                 # starts Postgres on localhost:5435
npm run db:migrate            # applies migrations in ./drizzle
npm run check-env             # validates .env and the database connection
npm run dev                   # http://localhost:3000
```

**[docs/SETUP.md](docs/SETUP.md) explains every environment variable**, how to obtain the Entra ID values
(including a request template for the IT department) and how to troubleshoot sign-in errors.

Without Microsoft credentials you can still work locally: `npm run dev` shows a **development login**
with test users per role. It does not exist in a production build.

Sign-in with Microsoft is restricted by **tenant ID** (the `tid` claim), not by e-mail domain. Other
users from an allowed tenant land on a "waiting for approval" screen until an admin assigns a role under
**Gebruikers**.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm run start:prod` | Production build (standalone server, assets copied by `postbuild`) / start it |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run check-env` | Validate `.env` (add `-- --production` for production rules) |
| `npm run db:up` | Start local Postgres (docker compose) |
| `npm run db:generate` | Generate a migration after changing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npx tsx scripts/excel-to-sql.ts "<file.xlsx>" imports/<name>.sql` | Convert the "Stakeholders per fase" Excel into SQL for a new project with phases, activities and stakeholders |
| `npx tsx scripts/conflicts-to-sql.ts "<file.xlsx>" imports/<name>.sql` | Convert the "Belangenverstrengeling per fase" Excel into SQL that appends conflicts to the stakeholders' interests (reads names from the database, read-only) |
| `npx tsx scripts/docx-links-to-sql.ts "<file.docx>" imports/<name>.sql` | Convert the source links per stakeholder in the stakeholder Word document into SQL that adds them as documentation (reads names from the database, read-only; skips URLs a stakeholder already has) |
| `npx tsx scripts/template-to-activities.ts "<V01.xlsx>" imports/<name>.sql "<project>"` | Convert a project imported before activities existed to the activity model (one-off; refuses if the project already has activities) |
| `npx tsx scripts/activity-conflicts-to-sql.ts "<file.xlsx>" imports/<name>.sql "<project>"` | Add the conflicts from "Belangenverstrengeling per fase" to the matching activities (skips conflicts an activity already has) |
| `npx tsx scripts/docx-profiles-to-sql.ts "<file.docx>" imports/<name>.sql "<project>"` | Fill "Over deze stakeholder" from the stakeholder Word document (text per section, without sources; only empty profiles) |
| `npx tsx scripts/smoke-history.ts` | Smoke test of the version-history layer (development DB only) |

## Template project (one script)

`scripts/build-template-sql.ts` builds the complete template project **"Sjabloon – Stakeholders per fase"** in one SQL
script from the three source documents: phases, activities and stakeholders per activity (V01 Excel), conflicts of
interest per activity (Belangenverstrengeling Excel), and "Over deze stakeholder" text plus source links per
stakeholder (V02 Word document). It needs no database access and writes everything to the version history.

```bash
npx tsx scripts/build-template-sql.ts "<V01 - Stakeholders per fase.xlsx>" "<Belangenverstrengeling_per_fase_woningbouw.xlsx>" "<V02 - Stakeholders bij gebiedsontwikkeling voor woningbouw.docx>" imports/sjabloon-volledig.sql
```

Run the result on a migrated database (pgAdmin Query Tool, or
`docker compose exec -T db psql -U checklist -d checklist -v ON_ERROR_STOP=1 -f - < imports/sjabloon-volledig.sql`).
It stops without changes if a project with that name already exists. The other import scripts in the table above
update existing projects step by step; for a fresh template only this one is needed.

## Architecture notes

- **All writes to checklist data go through [`src/lib/history.ts`](src/lib/history.ts).** It records
  an append-only event with before/after snapshots for every change, bumps the row `version`
  (optimistic locking) and never hard-deletes. Revert / point-in-time restore are new events.
- Server actions live in `src/actions/`; they check the role (`requireUser`) and that the project is
  not archived (`assertProjectWritable`) before writing.
- Roles are application-wide (`admin`, `editor`, `viewer`) and read from the database on each
  request, so role changes apply immediately.
- Uploaded files are stored in the `blobs` table (Postgres `bytea`), max 25 MB. Copies between
  projects share the blob. Blob access is limited to `src/actions/content.ts` and
  `src/app/files/[id]/route.ts`, to ease a later move to object storage.
