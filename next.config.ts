import type { NextConfig } from "next";

const cspDirectives = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://img.youtube.com",
  "media-src 'self' blob:",
  "font-src 'self'",
  "frame-src https://www.youtube.com https://player.vimeo.com",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  {
    key:
      process.env.NODE_ENV === "development"
        ? "Content-Security-Policy-Report-Only"
        : "Content-Security-Policy",
    value: cspDirectives.join("; "),
  },
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
