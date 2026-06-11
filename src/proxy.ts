import { NextRequest, NextResponse } from "next/server";

// Nonce-based Content-Security-Policy (XSS hardening).
//
// Uses Next 16's `proxy` convention (the former `middleware`). A per-request nonce
// lets us keep `script-src` free of 'unsafe-inline', which is the only CSP
// configuration that meaningfully defends a user-generated-content forum against
// script-injection XSS. Next.js automatically stamps this nonce onto the inline
// <script> tags it emits, because we forward the CSP on the request headers below
// (see the `request` option on NextResponse.next).
//
// Previously the CSP lived in next.config.ts as a static `script-src 'self'`, which
// (with no nonce and no 'unsafe-inline') blocks Next's own inline hydration scripts
// in production — it only "worked" in dev because dev used Report-Only mode.
// R2 public host for uploaded media (e.g. https://pub-….r2.dev). Read from env
// so the bucket URL isn't hardcoded in a public repo; empty string if unset.
const r2Host = (() => {
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) return "";
  try {
    return new URL(base).origin;
  } catch {
    return "";
  }
})();

export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";

  // 16 random bytes, base64 — fresh per request (Web Crypto; Edge-runtime safe).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' lets the nonce'd bootstrap script load the rest of the chunks;
    // dev additionally needs 'unsafe-eval' for React Fast Refresh.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://img.youtube.com${r2Host ? ` ${r2Host}` : ""}`,
    `media-src 'self' blob:${r2Host ? ` ${r2Host}` : ""}`,
    "font-src 'self'",
    "frame-src https://www.youtube.com https://player.vimeo.com",
    // dev needs websockets for HMR.
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  // Forward nonce + CSP on the request so the renderer can nonce its own scripts...
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // ...and set the enforced CSP on the response that reaches the browser.
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Document routes only — skip API (JSON), Next internals, and any file with an extension.
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
