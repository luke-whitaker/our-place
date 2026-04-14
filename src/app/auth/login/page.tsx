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

      if (data.user.is_verified) {
        router.push("/feed");
      } else {
        router.push("/auth/verify");
      }
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
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xl font-bold shadow-lg shadow-indigo-500/25 mb-6">
          OP
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900">
          Our Place
        </h1>
        <p className="mt-3 text-lg sm:text-xl font-medium text-indigo-600">
          How social media is meant to be.
        </p>

        <div className="mt-10 space-y-6 text-base sm:text-lg leading-relaxed text-gray-600 text-left sm:text-center">
          <p>
            Our Place is being built on a simple belief: social media should serve <em>you</em>, not
            the other way around. We&apos;re developing a platform that optimizes for genuine
            human-to-human interaction — real conversations, real connections, and real community.
            Here, you customize your own algorithm so your feed is tailored to what <em>you</em>{" "}
            want to see, when you want to see it. Enjoy an endless scroll with more control — set a
            default session length or enable self-imposed check-ins that remind you when it&apos;s
            time to step away. Just people connecting with people, on their own terms.
          </p>
          <p>
            Here, you can dive deep into the things that matter to you — your interests, passions,
            hobbies, and profession — surrounded by others who share that same curiosity. And you
            can do it without being fed ads, without having your attention sold to the highest
            bidder, and without ever compromising your personal data. Your information belongs to
            you. Full stop.
          </p>
          <p>
            We believe people deserve better options than what social media has offered so far. Our
            Place is built to give you those options — the ones you didn&apos;t realize you could
            have. A space where you feel empowered, not exploited. Where the platform works{" "}
            <em>for</em> its community, not against it. Welcome to how social media is meant to be.
          </p>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="w-full max-w-md flex items-center gap-4 mb-10">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">
          Get Started
        </span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* ── Login Form ── */}
      <div className="w-full max-w-md">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          {error && (
            <div className="mb-5 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                placeholder="Your password"
                required
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          </div>

          <div className="mt-4 text-right">
            <Link
              href="/auth/forgot-password"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              Forgot your password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing In..." : "Sign In"}
          </button>

          <p className="mt-5 text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/register"
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Create Your Account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
