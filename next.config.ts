import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Lets a second dev server (e.g. against a test database) run next to the normal one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Allow documentation uploads up to 25 MB through server actions.
    serverActions: { bodySizeLimit: "26mb" },
  },
};

export default nextConfig;
