/**
 * Check the .env file without starting the app.
 * Run: npm run check-env            (checks as development)
 *      npm run check-env -- --production
 */
import "dotenv/config";
import postgres from "postgres";
import { validateEnv } from "../src/lib/env";

async function main() {
  const production = process.argv.includes("--production");
  const env: Record<string, string | undefined> = { ...process.env, NODE_ENV: production ? "production" : "development" };
  const report = validateEnv(env);

  console.log(`Controle van .env (${production ? "productie" : "ontwikkeling"})\n`);
  for (const e of report.errors) console.log(`  ✗ ${e}`);
  for (const w of report.warnings) console.log(`  ! ${w}`);

  // Try the database connection as well.
  if (env.DATABASE_URL) {
    const sql = postgres(env.DATABASE_URL, { max: 1, connect_timeout: 5 });
    try {
      await sql`select 1`;
      console.log("  ✓ Database bereikbaar");
    } catch (err) {
      report.errors.push("db");
      console.log(`  ✗ Database niet bereikbaar (${(err as Error).message}). Draait 'npm run db:up'?`);
    } finally {
      await sql.end({ timeout: 1 });
    }
  }

  console.log(`  ${report.entraConfigured ? "✓" : "-"} Microsoft-login ${report.entraConfigured ? "ingevuld" : "niet ingevuld"}`);
  if (!production) console.log("  ✓ Ontwikkel-login beschikbaar (alleen met npm run dev)");

  console.log(report.errors.length === 0 ? "\nAlles in orde." : `\n${report.errors.length} fout(en) gevonden. Zie docs/SETUP.md.`);
  process.exit(report.errors.length === 0 ? 0 : 1);
}

main();
