"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import CommunityCard from "@/components/CommunityCard";
import { CommunityWithMembership, COMMUNITY_CATEGORIES } from "@/lib/types";

export default function CommunitiesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [communities, setCommunities] = useState<CommunityWithMembership[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loadingCommunities, setLoadingCommunities] = useState(true);

  const loadCommunities = useCallback(async () => {
    setLoadingCommunities(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category) params.set("category", category);

      const res = await fetch(`/api/communities?${params.toString()}`);
      const data = await res.json();
      setCommunities(data.communities || []);
    } catch {
      // ignore
    }
    setLoadingCommunities(false);
  }, [search, category]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (!user.is_verified) {
      router.replace("/auth/verify");
      return;
    }
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadCommunities();
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, router, loadCommunities]);

  useEffect(() => {
    if (!loading && user?.is_verified) {
      const timer = setTimeout(() => loadCommunities(), 300);
      return () => clearTimeout(timer);
    }
  }, [search, category, loading, user, loadCommunities]);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink">Communities</h1>
          <p className="text-sm text-ink-muted mt-1">Discover spaces that match your interests</p>
        </div>
        <Link
          href="/communities/create"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-ink-inverse shadow-md hover:shadow-lg transition-shadow"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create Community
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="relative flex-1">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search communities..."
            className="w-full rounded-xl border border-line bg-surface pl-10 pr-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink-secondary focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
        >
          <option value="">All Categories</option>
          {COMMUNITY_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Communities Grid */}
      {loadingCommunities ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="op-card animate-pulse rounded-2xl border border-line bg-surface overflow-hidden"
            >
              <div className="h-24 bg-surface-emphasis" />
              <div className="p-4 space-y-3">
                <div className="h-4 w-3/4 rounded bg-surface-emphasis" />
                <div className="h-3 w-full rounded bg-surface-emphasis" />
                <div className="h-3 w-2/3 rounded bg-surface-emphasis" />
              </div>
            </div>
          ))}
        </div>
      ) : communities.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {communities.map((community) => (
            <CommunityCard key={community.id} community={community} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-line bg-surface p-12 text-center">
          <h3 className="text-lg font-semibold text-ink">No communities found</h3>
          <p className="mt-2 text-sm text-ink-muted">
            {search || category
              ? "Try adjusting your search or filters."
              : "Be the first to create a community!"}
          </p>
          <Link
            href="/communities/create"
            className="mt-4 inline-flex rounded-xl bg-accent-500 px-6 py-2.5 text-sm font-medium text-ink-inverse hover:bg-accent-600"
          >
            Create One
          </Link>
        </div>
      )}
    </div>
  );
}
