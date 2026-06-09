import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
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
