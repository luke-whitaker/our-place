import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

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

// The phone check before a push opens the dev server at this Mac's Wi-Fi
// address. Next blocks its dev scripts for every origin but localhost unless the
// origin is listed, so the page would load on the phone and never run. List the
// machine's own LAN addresses, read fresh each time the dev server starts, since
// the Wi-Fi address changes. Production ignores this option.
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === "IPv4" && !address.internal)
    .map((address) => address.address);
}

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: lanAddresses(),
  headers: async () => [
    {
      source: "/:path*",
      headers: securityHeaders,
    },
  ],
};

export default nextConfig;
