import type { NextConfig } from "next";
import "@repo/env/server";

const nextConfig: NextConfig = {
  // Keep local verification builds separate from concurrently running servers.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  trailingSlash: true,
  images: { unoptimized: true },
  devIndicators: false,
  // The marketing renderer reads these files dynamically on the server.
  outputFileTracingIncludes: { "/*": ["./content/**/*.html"] },
};

export default nextConfig;
