# Installation guide — getting Krimpenerwaard Checklist running

This guide takes you from an empty machine to a working application: database, template project, Microsoft
sign-in and running the app (locally and in production). Every environment variable is explained in detail in
[SETUP.md](SETUP.md); this guide tells you **what to do in which order**.

**Overview**

| Step | What | Who |
|---|---|---|
| 1 | Install prerequisites and get the code | developer / IT |
| 2 | Create the PostgreSQL database and the tables | developer / IT |
| 3 | Load the template project | developer / IT |
| 4 | Register the app in Microsoft Entra ID | Entra administrator of the organisation |
| 5 | Fill in `.env` and check it | developer / IT |
| 6 | Run the app (development or production) | developer / IT |
| 7 | First sign-in and user management | first admin |
| 8 | Operations: backups, updates, monitoring | IT |

A checklist to tick off is at the end.

---

## 1. Prerequisites and code

**Software**

| Tool | Version | Used for |
|---|---|---|
| Node.js | 20 LTS or newer (developed on 24) | building and running the app, scripts |
| npm | comes with Node.js | installing packages |
| PostgreSQL | 15 or newer (developed on 17) | the database |
| Docker Desktop | optional, recommended for local use | runs PostgreSQL via `docker-compose.yml` |
| Git | any | getting the code |

**Get the code and install packages**

```bash
git clone <repository-url> krimpenerwaard_checklist
cd krimpenerwaard_checklist
npm install
cp .env.example .env
```

> The repository does not contain `.env` (secrets) or `backups/`. Never commit `.env`.

---

## 2. Database

The app needs one empty PostgreSQL database. The tables are created by **migrations** (`drizzle/*.sql`).

### Option A — local, with Docker (development / testing)

```bash
npm run db:up        # starts PostgreSQL 17 on localhost:5435 (user/password/database: checklist)
```

`DATABASE_URL` in `.env`:

```
DATABASE_URL=postgres://checklist:checklist@localhost:5435/checklist
```

### Option B — a PostgreSQL server (production)

For example Azure Database for PostgreSQL (choose an EU region — the database contains names and comments, GDPR)
or a server managed by IT.

1. Create a database (e.g. `checklist`) and a user that **owns** it (it must be able to create tables and types).
2. Put the connection string in `.env`; add `?sslmode=require` when the server requires TLS:
   ```
   DATABASE_URL=postgres://<user>:<password>@<host>:5432/checklist?sslmode=require
   ```
3. Make sure the machine that runs the app (and the machine you run migrations from) can reach the database
   (firewall / allowed IP addresses).

### Create the tables

```bash
npm run db:migrate
```

Run this once on a new database, and **again after every update of the code** (see step 8). It only applies
migrations that have not been applied yet; existing data is kept.

> **Starting over with an empty database?** Remove the *whole* database (or, with Docker:
> `docker compose down -v`), then `npm run db:up` and `npm run db:migrate`. Do not just drop the tables:
> the migration bookkeeping (`drizzle.__drizzle_migrations`) and the enum types would stay behind and
> `db:migrate` would then skip creating the tables.

---

## 3. Load the template project

The template project **"Sjabloon – Stakeholders per fase"** contains 5 phases, 53 activities, 206 stakeholders
(leading / involved per activity), 123 conflicts of interest, background texts ("Over deze stakeholder") and
912 source links. Users copy from it into real projects via **Kopiëren uit project**.

The ready-made SQL is in the repository: `imports/sjabloon-volledig.sql`. Run it **after** `npm run db:migrate`:

```bash
# local Docker database
docker compose exec -T db psql -U checklist -d checklist -v ON_ERROR_STOP=1 -f - < imports/sjabloon-volledig.sql

# any PostgreSQL server (psql installed on your machine)
psql "<DATABASE_URL>" -v ON_ERROR_STOP=1 -f imports/sjabloon-volledig.sql
```

Or open the file in **pgAdmin → Query Tool** on the database and press **Execute (F5)**.

- It runs in one transaction: either everything is loaded or nothing.
- It stops with a message if a project with that name already exists (rename or delete that one first).
- Statuses, contact details, deadlines and comments are empty: they are not in the source documents.

**Rebuilding the template from new versions of the source documents**

```bash
npx tsx scripts/build-template-sql.ts \
  "<V01 - Stakeholders per fase.xlsx>" \
  "<Belangenverstrengeling_per_fase_woningbouw.xlsx>" \
  "<V02 - Stakeholders bij gebiedsontwikkeling voor woningbouw.docx>" \
  imports/sjabloon-volledig.sql
```

The script prints what it found (names that differ slightly, parties without a section in the Word document,
conflicts without a matching activity) so you can check the sources.

---

## 4. Microsoft sign-in (Entra ID app registration)

Users sign in with their Microsoft work account. This needs an **app registration** in Microsoft Entra ID,
created by someone with admin rights in the organisation's tenant (for the municipality: their IT department).
Step-by-step instructions and a ready-to-send request e-mail (in Dutch) are in [SETUP.md](SETUP.md#microsoft-entra-id-auth_microsoft_entra_id_id-and-auth_microsoft_entra_id_secret).

Summary of what IT has to set up:

| Setting | Value |
|---|---|
| Supported account types | Accounts in any organizational directory (**multitenant**) |
| Redirect URI (platform **Web**) | `https://<production-address>/api/auth/callback/microsoft-entra-id` — plus `http://localhost:3000/api/auth/callback/microsoft-entra-id` for development |
| API permission | Microsoft Graph `User.Read` (delegated), with **admin consent** |
| Client secret | create one; note its **expiry date** |

What you need back from IT:

1. **Application (client) ID** → `AUTH_MICROSOFT_ENTRA_ID_ID`
2. **Client secret — the *Value*** (not the Secret ID) → `AUTH_MICROSOFT_ENTRA_ID_SECRET`
3. **Directory (tenant) ID** → `ALLOWED_TENANT_IDS`

Only accounts from the tenants in `ALLOWED_TENANT_IDS` can sign in; access is checked on the tenant ID, not on
the e-mail domain. Look up a tenant ID without any rights via
`https://login.microsoftonline.com/<domain>/v2.0/.well-known/openid-configuration` (the GUID in `issuer`).

> The client secret expires (often after 6–24 months). Put a reminder in the calendar: when it expires, nobody
> can sign in until a new secret is set in `.env` and the app is restarted.

---

## 5. Configuration (`.env`)

Fill in `.env` (all variables are explained in [SETUP.md](SETUP.md)):

```
DATABASE_URL=postgres://...
AUTH_SECRET=<random, at least 32 characters — different per environment>
AUTH_URL=https://<production-address>          # http://localhost:3000 for development
AUTH_MICROSOFT_ENTRA_ID_ID=<Application (client) ID>
AUTH_MICROSOFT_ENTRA_ID_SECRET=<client secret Value>
ALLOWED_TENANT_IDS=<Krimpenerwaard tenant ID>
INITIAL_ADMIN_EMAIL=<work e-mail of the first admin>
```

Generate `AUTH_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Check the configuration (also tests the database connection):

```bash
npm run check-env                 # rules for development
npm run check-env -- --production # rules for production (Microsoft sign-in required)
```

The app also checks `.env` when it starts and refuses to start in production when something is missing or wrong.

---

## 6. Running the app

### Development (on your own machine)

```bash
npm run dev            # http://localhost:3000
```

Without Microsoft settings the login page shows a **development login** with test users per role (admin,
editor, viewer, pending). It only exists in development mode and never in a production build.

### Production

1. Build once per release:
   ```bash
   npm ci
   npm run build
   ```
   The build produces a self-contained server in `.next/standalone`; the static files are copied next to it
   automatically (`postbuild`). That folder is all the server needs (plus the environment variables), so it can
   also be copied to another machine or into a container image.
2. Start (port 3000 by default; set `PORT`, and `HOSTNAME=0.0.0.0` to listen on all interfaces):
   ```bash
   npm run start:prod        # = node .next/standalone/server.js
   ```
   (Plain `npm start` also works but prints a warning for this build type; use `start:prod`.)
3. Put it behind **HTTPS** (reverse proxy such as IIS/ARR, nginx, Azure App Service or Azure Container Apps).
   `AUTH_URL` must be exactly the public https address, and the same address (+ `/api/auth/callback/microsoft-entra-id`)
   must be registered as redirect URI in Entra.
4. Keep the process running and restart it automatically (Windows service, systemd, `pm2`, or the hosting
   platform itself).
5. Provide the environment variables to the process (on the hosting platform as *application settings*; do not
   ship a `.env` file with the code).

**Production checklist for the hosting**

- [ ] HTTPS with a valid certificate
- [ ] `NODE_ENV=production` (set automatically by `npm run start:prod`)
- [ ] Database reachable from the app, preferably not from the internet
- [ ] Uploads up to 25 MB allowed by the reverse proxy (e.g. nginx `client_max_body_size 26m`)
- [ ] Data stored in the EU (GDPR)

---

## 7. First sign-in and users

1. The person whose address is in `INITIAL_ADMIN_EMAIL` signs in with Microsoft and immediately becomes **admin**.
2. Everybody else who signs in lands on **"Wacht op goedkeuring"**. The admin opens **Gebruikers**, gives them a
   role (Admin / Bewerker / Lezer) and sets them to **Actief**.
3. Make at least one more person admin, so access does not depend on one account.
4. Users are never deleted, only deactivated (their name stays on history and comments).

Then open the template, check it, and create the first real project via **Nieuw project** → **Kopiëren uit project**.

---

## 8. Operations

### Backups

Everything (including uploaded files) is in the database. Make a daily backup and keep several:

```bash
pg_dump "<DATABASE_URL>" > checklist-$(date +%Y%m%d).sql                 # any server
docker compose exec -T db pg_dump -U checklist checklist > backup.sql    # local Docker
```

Restore into an **empty** database with `psql "<DATABASE_URL>" -f backup.sql`. Managed services (e.g. Azure)
also offer automatic backups / point-in-time restore — enable them.

Mistakes by users can usually be undone without a backup: an admin can revert a change or restore a whole project
to an earlier moment via **Geschiedenis** on the project.

### Updating to a new version of the code

```bash
git pull
npm ci
npm run db:migrate      # always before starting the new version
npm run build
# restart the app
```

Make a backup before `db:migrate`.

### Things to keep an eye on

| What | When | Action |
|---|---|---|
| Entra client secret | before the expiry date | new secret in Entra → `AUTH_MICROSOFT_ENTRA_ID_SECRET` → restart |
| Pending users | regularly | approve under **Gebruikers** |
| Database size | yearly | uploaded files live in the database (max 25 MB each) |
| Node.js / PostgreSQL versions | when they reach end of life | update and test |

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| App does not start: `Configuratiefouten in .env` | Run `npm run check-env` (add `-- --production` in production) and fix the items listed. |
| `Database niet bereikbaar` / connection refused | Database running? Correct host/port in `DATABASE_URL`? Firewall? With Docker: Docker Desktop running, port 5435. |
| `relation "…" does not exist` | Tables missing: `npm run db:migrate`. |
| `db:migrate` does nothing but tables are missing | Tables were dropped but the migration bookkeeping stayed: start with an empty database (step 2). |
| Template script: `Project … bestaat al` | Rename or delete the existing template project first. |
| Microsoft **AADSTS50011** (redirect URI mismatch) | Redirect URI in Entra must equal `<AUTH_URL>/api/auth/callback/microsoft-entra-id`. |
| Microsoft **AADSTS7000215** (invalid client secret) | Secret expired, or the Secret ID was used instead of the Value. |
| Microsoft **AADSTS90094 / 65001** (approval required) | An Entra admin must grant admin consent for the app. |
| "Je account hoort niet bij een organisatie…" | The account's tenant ID is not in `ALLOWED_TENANT_IDS`. |
| "Wacht op goedkeuring" | Normal for new users: an admin assigns a role under **Gebruikers**. |
| Everybody suddenly logged out | `AUTH_SECRET` changed (harmless; sign in again). |
| Hydration warning in the browser during development | Usually a browser extension (e.g. a password manager) changing the page; harmless. |

More detail on each variable and error: [SETUP.md](SETUP.md). Functional description of the app: [SPEC.md](SPEC.md).

---

## Checklist

- [ ] Node.js 20+ and the code installed (`npm install`)
- [ ] PostgreSQL database created, `DATABASE_URL` filled in
- [ ] Tables created (`npm run db:migrate`)
- [ ] Template loaded (`imports/sjabloon-volledig.sql`)
- [ ] Entra app registration created by IT (multitenant, redirect URI(s), `User.Read` with admin consent, secret)
- [ ] `.env` complete: `AUTH_SECRET`, `AUTH_URL`, Entra ID + secret, `ALLOWED_TENANT_IDS`, `INITIAL_ADMIN_EMAIL`
- [ ] `npm run check-env -- --production` says "Alles in orde"
- [ ] App built and running behind HTTPS, restarts automatically
- [ ] First admin signed in; at least one more admin assigned
- [ ] Daily backups configured; reminder for the client secret's expiry date
