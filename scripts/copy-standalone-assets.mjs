// Runs after `npm run build` (postbuild): makes the standalone server self-contained by copying the static
// assets and the public folder next to it, as Next.js requires for `output: "standalone"`.
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const distDir = process.env.NEXT_DIST_DIR || ".next";
const standalone = join(distDir, "standalone");

if (!existsSync(standalone)) {
  console.log(`[postbuild] ${standalone} not found; nothing to copy.`);
  process.exit(0);
}
cpSync(join(distDir, "static"), join(standalone, distDir, "static"), { recursive: true });
cpSync("public", join(standalone, "public"), { recursive: true });
console.log(`[postbuild] Copied static assets and public/ into ${standalone}. Start with: npm run start:prod`);
