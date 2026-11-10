/**
 * Validation of environment variables (.env). Used at server start (src/instrumentation.ts),
 * on the development login page, and by `npm run check-env`.
 *
 * Keep this module free of Next.js / database imports so the CLI script can use it.
 * Messages are Dutch because they are shown to the people configuring the app.
 */

export interface EnvReport {
  errors: string[];
  warnings: string[];
  entraConfigured: boolean;
  devLoginEnabled: boolean;
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PERSONAL_DOMAINS = ["gmail.com", "outlook.com", "hotmail.com", "live.com", "live.nl", "hotmail.nl", "icloud.com", "yahoo.com"];
const SEE_MANUAL = "Zie docs/SETUP.md.";

type Env = Record<string, string | undefined>;

const val = (env: Env, key: string) => (env[key] ?? "").trim();

/** The development login is only ever available when running `next dev`. */
export function isDevLoginEnabled(env: Env = process.env): boolean {
  return env.NODE_ENV === "development";
}

export function isEntraConfigured(env: Env = process.env): boolean {
  return val(env, "AUTH_MICROSOFT_ENTRA_ID_ID") !== "" && val(env, "AUTH_MICROSOFT_ENTRA_ID_SECRET") !== "";
}

export function validateEnv(env: Env = process.env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = env.NODE_ENV === "production";
  const devLoginEnabled = isDevLoginEnabled(env);

  // --- Database -------------------------------------------------------------
  const dbUrl = val(env, "DATABASE_URL");
  if (!dbUrl) errors.push(`DATABASE_URL ontbreekt. ${SEE_MANUAL}`);
  else if (!/^postgres(ql)?:\/\//.test(dbUrl)) {
    errors.push("DATABASE_URL moet beginnen met postgres:// of postgresql://.");
  }

  // --- Auth.js secret -------------------------------------------------------
  const secret = val(env, "AUTH_SECRET");
  if (!secret) errors.push(`AUTH_SECRET ontbreekt. Genereer er een (zie docs/SETUP.md).`);
  else if (secret.length < 32) errors.push("AUTH_SECRET is te kort: gebruik minimaal 32 tekens.");

  const authUrl = val(env, "AUTH_URL");
  if (authUrl && !/^https?:\/\/[^/]+/.test(authUrl)) {
    errors.push("AUTH_URL is geen geldige URL (bijv. http://localhost:3000).");
  }
  if (isProduction && authUrl.startsWith("http://") && !authUrl.includes("localhost")) {
    warnings.push("AUTH_URL gebruikt http:// in productie; gebruik https://.");
  }

  // --- Microsoft Entra ID ---------------------------------------------------
  const clientId = val(env, "AUTH_MICROSOFT_ENTRA_ID_ID");
  const clientSecret = val(env, "AUTH_MICROSOFT_ENTRA_ID_SECRET");
  const entraConfigured = clientId !== "" && clientSecret !== "";

  if ((clientId === "") !== (clientSecret === "")) {
    errors.push(
      "Vul AUTH_MICROSOFT_ENTRA_ID_ID en AUTH_MICROSOFT_ENTRA_ID_SECRET allebei in, of laat ze allebei leeg.",
    );
  }
  if (clientId && !GUID_RE.test(clientId)) {
    errors.push(
      "AUTH_MICROSOFT_ENTRA_ID_ID moet de 'Application (client) ID' zijn: een GUID zoals 1b2c3d4e-....",
    );
  }
  if (clientSecret && GUID_RE.test(clientSecret)) {
    errors.push(
      "AUTH_MICROSOFT_ENTRA_ID_SECRET lijkt een GUID. Je hebt waarschijnlijk de 'Secret ID' gekopieerd in plaats van de 'Value'. Maak een nieuw secret aan en kopieer de Value.",
    );
  }

  const tenantIds = val(env, "ALLOWED_TENANT_IDS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const t of tenantIds) {
    if (!GUID_RE.test(t)) {
      errors.push(
        `ALLOWED_TENANT_IDS bevat "${t}". Dit moet een tenant-ID (GUID) zijn, geen domeinnaam. ` +
          `Opzoeken: https://login.microsoftonline.com/${t.includes(".") ? t : "<domein>"}/v2.0/.well-known/openid-configuration (zie "issuer").`,
      );
    }
  }
  if (entraConfigured && tenantIds.length === 0) {
    errors.push("ALLOWED_TENANT_IDS is leeg: niemand kan inloggen met Microsoft. Vul minimaal één tenant-ID in.");
  }

  if (!entraConfigured) {
    if (isProduction) {
      errors.push(`Microsoft-login is niet geconfigureerd; in productie is dat verplicht. ${SEE_MANUAL}`);
    } else if (devLoginEnabled) {
      warnings.push("Microsoft-login is niet geconfigureerd. Alleen de ontwikkel-login is beschikbaar.");
    }
  }

  // --- Initial admin --------------------------------------------------------
  const adminEmail = val(env, "INITIAL_ADMIN_EMAIL");
  if (adminEmail && !EMAIL_RE.test(adminEmail)) {
    errors.push("INITIAL_ADMIN_EMAIL is geen geldig e-mailadres.");
  } else if (adminEmail && PERSONAL_DOMAINS.includes(adminEmail.split("@")[1].toLowerCase())) {
    warnings.push(
      `INITIAL_ADMIN_EMAIL (${adminEmail}) is een persoonlijk account. Daarmee kun je niet inloggen; gebruik het werk/school-account uit de toegestane tenant.`,
    );
  }
  if (entraConfigured && !adminEmail) {
    warnings.push("INITIAL_ADMIN_EMAIL is leeg: er wordt geen eerste admin aangemaakt via Microsoft-login.");
  }

  return { errors, warnings, entraConfigured, devLoginEnabled };
}

/** Log the report; throw when there are errors (used at server start). */
export function assertEnv(env: Env = process.env) {
  const report = validateEnv(env);
  for (const w of report.warnings) console.warn(`[env] Waarschuwing: ${w}`);
  if (report.errors.length > 0) {
    const message = `Configuratiefouten in .env:\n${report.errors.map((e) => `  - ${e}`).join("\n")}`;
    console.error(`[env] ${message}`);
    throw new Error(message);
  }
  return report;
}
