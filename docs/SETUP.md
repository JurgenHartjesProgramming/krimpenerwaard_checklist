# Setup manual — environment variables

This manual explains every variable in `.env`: what it is, where to get it, and common mistakes.

Quick start:

```bash
cp .env.example .env     # create your own .env (never commit it)
npm install
npm run db:up            # start Postgres in Docker
npm run db:migrate       # create the tables
npm run check-env        # validate .env and the database connection
npm run dev              # http://localhost:3000
```

`npm run check-env` reports every problem in Dutch with a hint. The app also validates `.env` at start-up
and refuses to start with invalid values; in development the login page shows the same report.

---

## Overview

| Variable | Needed for development | Needed for production | Where it comes from |
|---|---|---|---|
| `DATABASE_URL` | ✅ | ✅ | `docker-compose.yml` (dev) / hosting provider (prod) |
| `AUTH_SECRET` | ✅ | ✅ | you generate it |
| `AUTH_URL` | recommended | ✅ | the address of the app |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | optional | ✅ | Entra app registration |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | optional | ✅ | Entra app registration |
| `ALLOWED_TENANT_IDS` | with Entra | ✅ | tenant ID of each allowed organisation |
| `INITIAL_ADMIN_EMAIL` | with Entra | ✅ (first start) | the person who will be the first admin |

Without the three Entra variables you can still work locally with the **development login** (see the end
of this manual).

---

## `DATABASE_URL`

Connection string for PostgreSQL: `postgres://<user>:<password>@<host>:<port>/<database>`.

**Development:** use the database from `docker-compose.yml`, which listens on port **5435**:

```
DATABASE_URL=postgres://checklist:checklist@localhost:5435/checklist
```

Start it with `npm run db:up` (Docker Desktop must be running), then `npm run db:migrate`.

**Production:** use the connection string from your hosting provider (e.g. Azure Database for PostgreSQL:
*Settings → Connect*). Add `?sslmode=require` when the provider requires TLS.

**Viewing the data (pgAdmin 4):** *Servers → Register → Server…*, host `localhost`, port `5435`,
database/user/password `checklist`. Do not edit data in pgAdmin: changes made there bypass the version
history.

---

## `AUTH_SECRET`

Random secret used to encrypt the login session cookie. At least 32 characters. Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

- Use a **different** secret for production than for development.
- Changing it logs everybody out (harmless).
- Do **not** use `npx auth secret`: that npm package is now the Better Auth CLI and prints a
  `BETTER_AUTH_SECRET` (the value would work, but the name is wrong and it installs an unrelated tool).

---

## `AUTH_URL`

The public address of the app, without a trailing slash.

```
AUTH_URL=http://localhost:3000                     # development
AUTH_URL=https://checklist.krimpenerwaard.nl       # production (example)
```

It must match the redirect URI registered in Entra (see below), otherwise Microsoft returns error
**AADSTS50011**.

---

## Microsoft Entra ID: `AUTH_MICROSOFT_ENTRA_ID_ID` and `AUTH_MICROSOFT_ENTRA_ID_SECRET`

These come from an **app registration** in Microsoft Entra ID. You need admin rights in a tenant (or the
"Users can register applications" setting) to create one. In practice the **Krimpenerwaard IT department**
creates it in their tenant — see *Requesting the registration from IT* below.

### Creating the app registration (for whoever has the rights)

1. Go to <https://entra.microsoft.com> → **Identity → Applications → App registrations → + New registration**.
2. **Name:** `Krimpenerwaard Checklist`.
3. **Supported account types:** *Accounts in any organizational directory (Any Microsoft Entra ID tenant –
   Multitenant)*. Access is limited to specific organisations by `ALLOWED_TENANT_IDS`, not here.
4. **Redirect URI:** platform **Web**, value `<AUTH_URL>/api/auth/callback/microsoft-entra-id`, e.g.
   - `http://localhost:3000/api/auth/callback/microsoft-entra-id` (development)
   - `https://checklist.krimpenerwaard.nl/api/auth/callback/microsoft-entra-id` (production)

   More URIs can be added later under **Authentication**.
5. Click **Register**. On the **Overview** page copy:
   - **Application (client) ID** → `AUTH_MICROSOFT_ENTRA_ID_ID`
   - **Directory (tenant) ID** → `ALLOWED_TENANT_IDS`
6. **Certificates & secrets → Client secrets → + New client secret** → choose an expiry → **Add**.
   Copy the **Value** column immediately (it is shown only once) → `AUTH_MICROSOFT_ENTRA_ID_SECRET`.
   ⚠️ Not the *Secret ID* column. `check-env` warns if the value looks like a GUID.
7. **API permissions:** the default `User.Read` (delegated) is enough. The app reads only the sign-in
   token (name, e-mail, tenant). If the organisation blocks user consent, an admin clicks
   **Grant admin consent for <organisation>**.

Note the secret's expiry date: when it expires nobody can sign in until a new secret is set.

### Requesting the registration from IT

Template e-mail (Dutch) for the Krimpenerwaard IT department:

> **Onderwerp:** Verzoek app-registratie Entra ID – Krimpenerwaard Checklist
>
> Beste collega's van IT,
>
> Voor de webapplicatie *Krimpenerwaard Checklist* (stakeholderchecklist per projectfase) heb ik een
> app-registratie in Microsoft Entra ID nodig. Gebruikers loggen in met hun Krimpenerwaard-account; de app
> leest alleen naam, e-mailadres en tenant uit het inlogtoken.
>
> Graag de volgende instellingen:
> - Naam: Krimpenerwaard Checklist
> - Ondersteunde accounttypen: *Accounts in any organizational directory (Multitenant)*
>   (de app laat zelf alleen de Krimpenerwaard-tenant toe)
> - Redirect URI's (platform Web):
>   - `http://localhost:3000/api/auth/callback/microsoft-entra-id` (ontwikkeling)
>   - `<productie-URL>/api/auth/callback/microsoft-entra-id` (zodra de hosting bekend is)
> - API-permissie: Microsoft Graph `User.Read` (gedelegeerd), met admin consent
> - Een client secret
>
> Ik ontvang graag via een veilig kanaal:
> 1. Application (client) ID
> 2. Directory (tenant) ID
> 3. Client secret (de *Value*) en de vervaldatum
>
> Daarnaast heb ik voor het testen een (test)account in de Krimpenerwaard-tenant nodig.
>
> Met vriendelijke groet,

---

## `ALLOWED_TENANT_IDS`

Comma-separated **tenant IDs (GUIDs)** of the organisations whose accounts may sign in. Anyone from another
organisation gets *"Je account hoort niet bij een organisatie die toegang heeft"*.

```
ALLOWED_TENANT_IDS=11111111-2222-3333-4444-555555555555
ALLOWED_TENANT_IDS=11111111-2222-3333-4444-555555555555,66666666-7777-8888-9999-000000000000
```

- **Production:** only the Krimpenerwaard tenant.
- **Test:** add the tenant of your own test account.
- It must be the GUID, **not a domain** such as `krimpenerwaard.nl` (`check-env` reports this).

Find the tenant ID of a domain without any rights: open
`https://login.microsoftonline.com/<domain>/v2.0/.well-known/openid-configuration` in a browser. The GUID is
in the `issuer` field: `https://login.microsoftonline.com/<TENANT-ID>/v2.0`.

---

## `INITIAL_ADMIN_EMAIL`

The e-mail address that automatically becomes an **active admin** on its first Microsoft sign-in. Every
other new user starts as *in afwachting* until an admin assigns a role under **Gebruikers**.

```
INITIAL_ADMIN_EMAIL=j.jansen@krimpenerwaard.nl
```

- It must be the **work/school account** from an allowed tenant (as shown at Microsoft sign-in). A personal
  address (gmail, outlook.com, …) cannot sign in.
- It only acts when that user is created; changing it later has no effect on existing users.
- Make at least one more person admin via **Gebruikers** so access does not depend on one account.

---

## Development login (no Microsoft account needed)

When the app runs with `npm run dev`, the login page shows an extra **Ontwikkel-login** panel with four
fixed test users:

| User | Role |
|---|---|
| Dev Admin | admin |
| Dev Bewerker | editor |
| Dev Lezer | viewer |
| Dev Nieuwe gebruiker | pending (to test the approval flow) |

- It exists **only** when `NODE_ENV=development` (`npm run dev`). A production build (`npm run build` +
  `npm start`) does not register it at all, whatever is in `.env`.
- Roles of the test users can be changed under **Gebruikers** like any user.
- Never expose a `next dev` server to the internet.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| App does not start, `Configuratiefouten in .env` | Run `npm run check-env` and fix the listed items. |
| `Database niet bereikbaar` | Docker Desktop running? `npm run db:up`. Port in `DATABASE_URL` must be 5435. |
| `relation "users" does not exist` | Run `npm run db:migrate`. |
| Microsoft: **AADSTS50011** redirect URI mismatch | Redirect URI in Entra must equal `<AUTH_URL>/api/auth/callback/microsoft-entra-id`. |
| Microsoft: **AADSTS7000215** invalid client secret | Secret expired or the *Secret ID* was copied instead of the *Value*. Create a new secret. |
| Microsoft: **AADSTS700016** application not found | Wrong `AUTH_MICROSOFT_ENTRA_ID_ID`. |
| Microsoft: **AADSTS90094 / 65001** admin approval required | An admin of that organisation must grant consent (see step 7). |
| App: *"Je account hoort niet bij een organisatie…"* | The account's tenant ID is not in `ALLOWED_TENANT_IDS`. |
| App: *"Wacht op goedkeuring"* | Normal for new users: an admin assigns a role under **Gebruikers**. |
| Login page: *"Inloggen met Microsoft is nog niet ingesteld"* | Entra variables are empty. |
