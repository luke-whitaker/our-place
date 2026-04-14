"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user?.is_verified) {
      router.replace("/feed");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
      {/* Hero Section */}
      <section className="relative px-4 pt-20 pb-32 sm:px-6 lg:pt-32 lg:pb-40">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-50 opacity-60 blur-3xl" />
          <div className="absolute top-40 right-0 h-64 w-64 rounded-full bg-indigo-100 opacity-40 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-purple-100 opacity-40 blur-3xl" />
        </div>

        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700 mb-8">
            <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            Reimagining social media for real humans
          </div>

          <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl lg:text-7xl">
            Welcome to{" "}
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">
              Our Place
            </span>
          </h1>

          <p className="mt-6 text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto sm:text-xl">
            A social platform built on trust, belonging, and genuine connection. One human, one
            account — because real communities are built by real people.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/register"
              className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:shadow-indigo-500/30 hover:brightness-110"
            >
              Create Your Account
            </Link>
            <Link
              href="/auth/login"
              className="w-full sm:w-auto rounded-xl border border-gray-200 bg-white px-8 py-3.5 text-base font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="border-t border-gray-200 bg-white px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Social media, reimagined
            </h2>
            <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
              We designed Our Place from the ground up to prioritize what matters most — you and
              your community.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* Value 1 */}
            <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50/50 p-8 transition-shadow hover:shadow-lg">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 mb-5">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">One Human, One Account</h3>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                Every account is verified to belong to a real person. No bots, no duplicates, no
                anonymous trolling. Just real people having real conversations.
              </p>
            </div>

            {/* Value 2 */}
            <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50/50 p-8 transition-shadow hover:shadow-lg">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600 mb-5">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Community-First Design</h3>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                Everything revolves around communities — spaces built around shared interests,
                goals, and values. Join ones that resonate or create your own.
              </p>
            </div>

            {/* Value 3 */}
            <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50/50 p-8 transition-shadow hover:shadow-lg">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 mb-5">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Safe & Collaborative</h3>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                Built with safety at its core. Community guidelines, member accountability, and
                collaborative moderation create a space where everyone can thrive.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">How it works</h2>
            <p className="mt-4 text-lg text-gray-500">Getting started takes just a few minutes.</p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500 text-white text-xl font-bold shadow-lg shadow-indigo-500/25">
                1
              </div>
              <h3 className="mt-5 text-base font-semibold text-gray-900">Verify Your Identity</h3>
              <p className="mt-2 text-sm text-gray-500">
                Create your one and only account. Our verification ensures every person here is
                real.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500 text-white text-xl font-bold shadow-lg shadow-purple-500/25">
                2
              </div>
              <h3 className="mt-5 text-base font-semibold text-gray-900">Join Communities</h3>
              <p className="mt-2 text-sm text-gray-500">
                Browse and join communities that match your interests, or create a brand new one.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-500 text-white text-xl font-bold shadow-lg shadow-pink-500/25">
                3
              </div>
              <h3 className="mt-5 text-base font-semibold text-gray-900">Share & Connect</h3>
              <p className="mt-2 text-sm text-gray-500">
                Post, comment, react, and build genuine connections with people who share your
                passions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-6xl text-center">
          <div className="flex items-center justify-center gap-2.5 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs font-bold">
              OP
            </div>
            <span className="text-base font-bold text-gray-900">Our Place</span>
          </div>
          <p className="text-sm text-gray-400">Built for real people. Powered by real community.</p>
        </div>
      </footer>
    </div>
  );
}
