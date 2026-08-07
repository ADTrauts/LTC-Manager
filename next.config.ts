import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // VERIFY/browser gates may set NEXT_DIST_DIR to isolate from concurrent `.next` wipes.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
