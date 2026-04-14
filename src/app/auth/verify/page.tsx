"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function VerifyPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
    if (!loading && user?.is_verified) {
      router.replace("/feed");
    }
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Verification failed.");
        return;
      }

      setSuccess(data.message);
      await refresh();

      setTimeout(() => {
        router.push("/feed");
      }, 1500);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white mb-4">
            <svg
              className="h-7 w-7"
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
          <h1 className="text-2xl font-bold text-gray-900">Verify Your Identity</h1>
          <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
            To keep Our Place safe, we need to confirm you&apos;re a real person. Enter the 6-digit
            verification code.
          </p>
        </div>

        {/* Info Notice */}
        <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
                />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-indigo-800">Check Your Email / Phone</p>
              <p className="text-xs text-indigo-700 mt-0.5">
                We&apos;ve sent a 6-digit verification code to the email and phone number you
                registered with. Enter it below to complete your verification.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          {error && (
            <div className="mb-5 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-5 rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-600">
              {success}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Verification Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setError("");
              }}
              placeholder="Enter 6-digit code"
              maxLength={6}
              required
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-xl font-mono tracking-[0.3em] text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          <button
            type="submit"
            disabled={code.length !== 6 || submitting}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Verifying..." : "Verify My Identity"}
          </button>
        </form>
      </div>
    </div>
  );
}
