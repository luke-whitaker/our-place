"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import PostCard from "@/components/PostCard";
import FriendRequestsPanel from "@/components/FriendRequestsPanel";
import FeedSidebar from "@/components/feed/FeedSidebar";
import FeedTabBar, { type FeedTab } from "@/components/feed/FeedTabBar";
import { apiFetch, userMessage } from "@/lib/api-client";
import { Post, CommunityWithMembership } from "@/lib/types";

// The transparency line is the product promise: every tab tells you exactly
// what it shows and how it's ordered, and that promise must stay true to the
// query behind it — see the ordering comments in the feed API routes.
const TAB_CONFIG: Record<FeedTab, { label: string; heading: string; subtitle: string }> = {
  friends: {
    label: "Friends",
    heading: "For Your Friends",
    subtitle: "Posts from your friends, newest first. Nothing is ranked or hidden.",
  },
  everyone: {
    label: "Everyone",
    heading: "For Everyone",
    subtitle: "Every post on Our Place, newest first. Nothing is ranked or hidden.",
  },
  communities: {
    label: "Communities",
    heading: "For Your Communities",
    subtitle: "Posts from communities you've joined, newest first. Nothing is ranked or hidden.",
  },
};

// ── Main Component ─────────────────────────────────────────

export default function FeedPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FeedTab>("communities");

  const [communityPosts, setCommunityPosts] = useState<Post[]>([]);
  const [friendPosts, setFriendPosts] = useState<Post[]>([]);
  const [everyonePosts, setEveryonePosts] = useState<Post[]>([]);
  const [communities, setCommunities] = useState<CommunityWithMembership[]>([]);
  const [errors, setErrors] = useState<Partial<Record<FeedTab, string>>>({});

  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadingTab, setLoadingTab] = useState(false);

  // ── Data loaders ──
  // Each throws on failure; callers decide what "failed" means for their UI.

  const loadCommunityFeed = useCallback(async () => {
    const [feedData, commData] = await Promise.all([
      apiFetch<{ posts: Post[] }>("/api/feed"),
      apiFetch<{ communities: CommunityWithMembership[] }>("/api/communities?joined=true"),
    ]);
    setCommunityPosts(feedData.posts || []);
    setCommunities(commData.communities || []);
  }, []);

  const loadFriendsFeed = useCallback(async () => {
    const data = await apiFetch<{ posts: Post[] }>("/api/feed/friends");
    setFriendPosts(data.posts || []);
  }, []);

  const loadEveryoneFeed = useCallback(async () => {
    const data = await apiFetch<{ posts: Post[] }>("/api/feed/explore");
    setEveryonePosts(data.posts || []);
  }, []);

  // Initial load
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (!user.avatar) {
      router.replace("/avatar-builder");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await loadCommunityFeed();
      } catch (err) {
        if (!cancelled) {
          setErrors((prev) => ({
            ...prev,
            communities: userMessage(err, "Couldn't load your feed."),
          }));
        }
      } finally {
        if (!cancelled) setLoadingFeed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, router, loadCommunityFeed]);

  // Tab switch loader
  async function switchTab(tab: FeedTab) {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setLoadingTab(true);
    try {
      if (tab === "friends" && friendPosts.length === 0) await loadFriendsFeed();
      if (tab === "everyone" && everyonePosts.length === 0) await loadEveryoneFeed();
      if (tab === "communities" && communityPosts.length === 0) await loadCommunityFeed();
      setErrors((prev) => ({ ...prev, [tab]: undefined }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, [tab]: userMessage(err, "Couldn't load this feed.") }));
    }
    setLoadingTab(false);
  }

  // ── Loading state ──

  if (loading || loadingFeed) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  // ── Render helpers ──

  function renderPostList(
    posts: Post[],
    emptyMessage: string,
    emptyAction?: { label: string; href: string },
  ) {
    if (loadingTab) {
      return (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-accent-500 border-t-transparent" />
        </div>
      );
    }

    if (posts.length > 0) {
      return (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      );
    }

    return (
      <div className="rounded-2xl border-2 border-dashed border-line bg-surface p-12 text-center">
        <h3 className="text-lg font-semibold text-ink">{emptyMessage}</h3>
        {emptyAction && (
          <Link
            href={emptyAction.href}
            className="mt-5 inline-flex rounded-xl bg-accent-500 px-6 py-2.5 text-sm font-medium text-ink-inverse hover:bg-accent-600"
          >
            {emptyAction.label}
          </Link>
        )}
      </div>
    );
  }

  // ── Tab content ──

  function renderTabContent() {
    const tabError = errors[activeTab];

    switch (activeTab) {
      case "friends":
        return (
          <div className="space-y-6">
            <FriendRequestsPanel onFriendshipChanged={loadFriendsFeed} />
            <div className="flex justify-end">
              <Link
                href="/people"
                className="text-xs font-medium text-accent-600 hover:text-accent-500"
              >
                Manage friends
              </Link>
            </div>
            {tabError && <p className="text-sm text-red-600">{tabError}</p>}
            {renderPostList(
              friendPosts,
              "No friend posts yet — visit someone's place to add them as a friend",
              {
                label: "Browse Communities and Add Friends",
                href: "/communities",
              },
            )}
          </div>
        );

      case "everyone":
        return (
          <div className="space-y-4">
            {tabError && <p className="text-sm text-red-600">{tabError}</p>}
            {renderPostList(everyonePosts, "Nothing to show yet — be the first to post!", {
              label: "Explore Communities",
              href: "/communities",
            })}
          </div>
        );

      case "communities":
        return (
          <div className="space-y-4">
            {tabError && <p className="text-sm text-red-600">{tabError}</p>}
            {renderPostList(communityPosts, "Your feed is empty", {
              label: "Browse Communities",
              href: "/communities",
            })}
          </div>
        );
    }
  }

  // ── Main render ──

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:pb-8 sm:px-6">
      <div className="flex gap-8 pt-8">
        {/* Main Feed */}
        <div className="flex-1 min-w-0">
          {/* Dynamic Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-ink">{TAB_CONFIG[activeTab].heading}</h1>
            <p className="text-sm text-ink-muted mt-1">{TAB_CONFIG[activeTab].subtitle}</p>
          </div>

          {/* Tab Content */}
          {renderTabContent()}
        </div>

        {/* Sidebar — visible on communities tab, or as general sidebar on others */}
        <FeedSidebar communities={communities} />
      </div>

      {/* ── Bottom Dashboard Navigation (fixed on mobile, inline on desktop) ── */}
      <FeedTabBar
        activeTab={activeTab}
        onTabChange={switchTab}
        tabLabels={{
          friends: TAB_CONFIG.friends.label,
          everyone: TAB_CONFIG.everyone.label,
          communities: TAB_CONFIG.communities.label,
        }}
      />
    </div>
  );
}
