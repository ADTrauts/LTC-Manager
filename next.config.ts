import type { NextConfig } from "next";

/**
 * Server Action multipart uploads default to 1MB in Next.js.
 * Product uploads exceed that (Facility/Asset CSV ≤2MB, union handbook PDF ≤12MB),
 * which can stall the client on "Validating…" / "Saving…" instead of returning a clear error.
 * Leave headroom for multipart framing overhead.
 */
const SERVER_ACTION_UPLOAD_LIMIT = "15mb";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "worker-src 'self' blob:",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // VERIFY/browser gates may set NEXT_DIST_DIR to isolate from concurrent `.next` wipes.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverActions: {
      bodySizeLimit: SERVER_ACTION_UPLOAD_LIMIT,
    },
    proxyClientMaxBodySize: SERVER_ACTION_UPLOAD_LIMIT,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // Observe violations before enforcing CSP so Stripe and PWA behavior can be certified
            // without creating a production outage.
            key: "Content-Security-Policy-Report-Only",
            value: CONTENT_SECURITY_POLICY,
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=(), usb=()",
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
