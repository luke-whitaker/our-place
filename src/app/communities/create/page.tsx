"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch, userMessage } from "@/lib/api-client";
import { COMMUNITY_CATEGORIES } from "@/lib/types";

const COMMUNITY_ICONS = [
  "🌐",
  "🎨",
  "💡",
  "📚",
  "🎵",
  "🎮",
  "💪",
  "🍳",
  "🌍",
  "🤝",
  "❤️",
  "🏠",
  "🎯",
  "🔬",
  "✈️",
  "🐾",
  "📸",
  "🧘",
  "🎭",
  "🌱",
];

export default function CreateCommunityPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "",
    icon: "🌐",
    guidelines: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
    if (!loading && user && !user.is_verified) {
      router.replace("/auth/verify");
    }
  }, [user, loading, router]);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const data = await apiFetch<{ community: { slug: string } }>("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      router.push(`/communities/${data.community.slug}`);
    } catch (err) {
      setError(userMessage(err, "Failed to create community."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* Back link */}
      <Link
        href="/communities"
        className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink-secondary mb-6"
      >
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
            d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
          />
        </svg>
        Back to Communities
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Create a Community</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Build a new space around a topic, interest, or cause that doesn&apos;t already exist on
          Our Place.
        </p>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="op-card rounded-2xl border border-line bg-surface shadow-sm"
      >
        <div className="p-6 space-y-6">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Icon Selection */}
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-2">
              Community Icon
            </label>
            <div className="flex flex-wrap gap-2">
              {COMMUNITY_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => updateField("icon", icon)}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg transition-all ${
                    form.icon === icon
                      ? "bg-accent-100 ring-2 ring-accent-500 scale-110"
                      : "bg-surface-muted hover:bg-surface-emphasis"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1.5">
              Community Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="e.g., Photography Enthusiasts"
              maxLength={50}
              required
              className="w-full rounded-xl border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
            <p className="mt-1 text-xs text-ink-faint">
              {form.name.length}/50 characters · Must be unique
            </p>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1.5">Category</label>
            <select
              value={form.category}
              onChange={(e) => updateField("category", e.target.value)}
              required
              className="w-full rounded-xl border border-line px-4 py-2.5 text-sm text-ink-secondary focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            >
              <option value="">Select a category</option>
              {COMMUNITY_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1.5">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="What is this community about? What can members expect?"
              rows={4}
              required
              className="w-full resize-none rounded-xl border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
            <p className="mt-1 text-xs text-ink-faint">
              At least 20 characters. Help people understand what this community is for.
            </p>
          </div>

          {/* Guidelines */}
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1.5">
              Community Guidelines
              <span className="text-ink-faint font-normal"> (optional)</span>
            </label>
            <textarea
              value={form.guidelines}
              onChange={(e) => updateField("guidelines", e.target.value)}
              placeholder="Set expectations for how members should interact..."
              rows={3}
              className="w-full resize-none rounded-xl border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-line-soft bg-surface-muted px-6 py-4 rounded-b-2xl">
          <Link
            href="/communities"
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-ink-tertiary hover:bg-surface-inset transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-gradient-to-r from-accent-500 to-purple-600 px-6 py-2.5 text-sm font-medium text-ink-inverse shadow-md hover:shadow-lg transition-all disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Community"}
          </button>
        </div>
      </form>
    </div>
  );
}
