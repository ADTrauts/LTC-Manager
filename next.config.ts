import type { NextConfig } from "next";

/**
 * Server Action multipart uploads default to 1MB in Next.js.
 * Product uploads exceed that (Facility/Asset CSV ≤2MB, union handbook PDF ≤12MB),
 * which can stall the client on "Validating…" / "Saving…" instead of returning a clear error.
 * Leave headroom for multipart framing overhead.
 */
const SERVER_ACTION_UPLOAD_LIMIT = "15mb";

const nextConfig: NextConfig = {
  // VERIFY/browser gates may set NEXT_DIST_DIR to isolate from concurrent `.next` wipes.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverActions: {
      bodySizeLimit: SERVER_ACTION_UPLOAD_LIMIT,
    },
    proxyClientMaxBodySize: SERVER_ACTION_UPLOAD_LIMIT,
  },
};

export default nextConfig;
