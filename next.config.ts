import type { NextConfig } from "next";

// Content-Security-Policy is set per-request (with a nonce) in src/proxy.ts —
// a static header here can't carry a nonce, and nonce-based script-src is what
// actually protects a UGC forum from script-injection XSS.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // No `preload`: the apex domain redirect is handled at the registrar, outside
  // this app's control, and preload lists are effectively permanent — we'd be
  // committing infrastructure we don't own to HTTPS-only forever.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  headers: async () => [
    {
      source: "/:path*",
      headers: securityHeaders,
    },
  ],
};

export default nextConfig;
