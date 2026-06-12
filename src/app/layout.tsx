import type { Metadata } from "next";
import { Geist, Geist_Mono, Pixelify_Sans, VT323, IBM_Plex_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";
import ErrorBoundary from "@/components/ErrorBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Theme display faces (see the Themes block in globals.css)
const pixelify = Pixelify_Sans({
  variable: "--font-pixel",
  subsets: ["latin"],
});

const vt323 = VT323({
  variable: "--font-vt",
  weight: "400",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

// Sets data-theme on <html> before first paint (no theme flash). "auto" resolves
// to platinum during the day, terminal at night. Mirrors src/lib/theme.ts —
// inlined because it must run before React hydrates.
const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("op-theme")||"auto";if(t==="auto"){var h=new Date().getHours();t=h>=7&&h<19?"platinum":"terminal";}if(["platinum","terminal","dusk"].indexOf(t)>-1){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

// Rendered dynamically so the per-request CSP nonce from src/proxy.ts reaches Next's
// inline <script> tags — nonce-based CSP (our primary XSS defense) requires dynamic
// rendering.
//
// REVISIT this force-dynamic choice when ANY of these becomes true (it's a refinement,
// not a rewrite — make just the affected routes static with their own relaxed CSP):
//   1. You add public, cacheable pages you want served from a CDN/edge (landing page,
//      public community browse, SEO pages).
//   2. You move past invite-only to public / at-scale signups.
//   3. Monitoring shows page-render CPU or TTFB among your top costs (realistically only
//      at thousands of concurrent users, since these pages render as DB-free shells and
//      fetch their data client-side).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Our Place — Community-First Social Platform",
  description:
    "A safe, secure, and collaborative social platform built around real communities. One human, one account.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Per-request CSP nonce from src/proxy.ts — required for the inline theme script.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    // Font variables live on <html> so the [data-theme] blocks in globals.css can
    // reference them (custom properties resolve at the element that defines them).
    // suppressHydrationWarning: the boot script sets data-theme pre-hydration.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${pixelify.variable} ${vt323.variable} ${plexMono.variable}`}
    >
      <body className="antialiased">
        {/* suppressHydrationWarning: browsers blank the nonce attribute in the DOM,
            so client React always sees "" vs the server's value. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
        />
        <ErrorBoundary>
          <AuthProvider>
            <Navbar />
            <main className="min-h-[calc(100vh-4rem)]">
              <ErrorBoundary>{children}</ErrorBoundary>
            </main>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
