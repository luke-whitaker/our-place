"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed.");
        return;
      }

      await refresh();

      router.push("/feed");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center px-4 py-12 sm:py-20">
      {/* ── Manifesto ── */}
      <div className="w-full max-w-2xl text-center mb-14">
        {/* Brand */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-purple-600 text-ink-inverse text-xl font-bold shadow-lg shadow-accent-500/25 mb-6">
          OP
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-ink">Our Place</h1>
        <p className="mt-3 text-lg sm:text-xl font-medium text-accent-600">
          How social media is meant to be.
        </p>

        <div className="mt-10 space-y-6 text-base sm:text-lg leading-relaxed text-ink-tertiary text-left sm:text-center">
          <p>
            Our Place is being built on a simple belief: social media should serve <em>you</em>, not
            the other way around. Our Place is a social media community that optimizes for genuine
            human-to-human interaction with real conversations, real connections, and real
            community.
          </p>
          <p>
            Here, you can dive deep into the things that matter to you — your interests, passions,
            hobbies, art, culture, and ideas — surrounded by others who share that same curiosity
            and <em>joie-de-vivre</em>, without being fed ads, without having your attention sold to
            the highest bidder, and without ever compromising your personal data. This social media
            site focuses more on building community than exploiting it. Our Place aims to
            democratize online social media platforms and the information you consume. While also
            providing everyone who participates in building the community with the opportunity to
            foster an online connection that will lead to an in-person community. That&apos;s why
            Our Place is only accepting users that have internally been approved to have an account.
            Anyone can view the site to see what it&apos;s all about, but in order to participate in
            the creation of Our Place (online), you must be given access by the admin.
          </p>
          <p>
            We believe people deserve more options of social media platforms that they can choose
            from. Our Place is built to give you another optional space for building community where
            you feel empowered, not exploited. Where the platform fosters community, and never aims
            to divide it for revenue&apos;s sake. Welcome to how social media was meant to be.
          </p>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="w-full max-w-md flex items-center gap-4 mb-10">
        <div className="flex-1 h-px bg-surface-inset" />
        <span className="text-xs font-medium text-ink-faint uppercase tracking-widest">
          Get Started
        </span>
        <div className="flex-1 h-px bg-surface-inset" />
      </div>

      {/* ── Login Form ── */}
      <div className="w-full max-w-md">
        <form
          onSubmit={handleSubmit}
          className="op-card rounded-2xl border border-line bg-surface p-6 shadow-sm"
        >
          {error && (
            <div className="mb-5 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-1.5">
                Email or Username
              </label>
              <input
                type="text"
                value={login}
                onChange={(e) => {
                  setLogin(e.target.value);
                  setError("");
                }}
                placeholder="you@example.com or @username"
                required
                className="w-full rounded-xl border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                placeholder="Your password"
                required
                className="w-full rounded-xl border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
              />
            </div>
          </div>

          <div className="mt-4 text-right">
            <Link
              href="/auth/forgot-password"
              className="text-sm font-medium text-accent-600 hover:text-accent-500"
            >
              Forgot your password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-accent-500 to-purple-600 px-4 py-3 text-sm font-semibold text-ink-inverse shadow-lg shadow-accent-500/25 transition-all hover:shadow-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing In..." : "Sign In"}
          </button>

          <p className="mt-5 text-center text-sm text-ink-faint">
            Accounts are created in person by an existing member.
          </p>
        </form>
      </div>
    </div>
  );
}
