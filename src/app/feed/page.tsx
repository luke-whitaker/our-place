"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import PostCard from "@/components/PostCard";
import FriendRequestsPanel from "@/components/FriendRequestsPanel";
import { Post, CommunityWithMembership } from "@/lib/types";

type FeedTab = "friends" | "scroll" | "communities" | "events";

interface EventItem {
  id: string;
  title: string;
  description: string;
  location: string;
  event_date: string;
  event_end_date: string | null;
  community_name?: string;
  community_icon?: string;
  creator_name?: string;
  creator_username?: string;
  creator_avatar_color?: string;
  rsvp_count?: number;
  user_rsvp?: string | null;
}

const TAB_CONFIG: Record<FeedTab, { label: string; heading: string; subtitle: string }> = {
  friends: {
    label: "Friends",
    heading: "For Your Friends",
    subtitle: "Recent posts from the people you know",
  },
  scroll: {
    label: "Endless Scroll",
    heading: "For Endless Scroll",
    subtitle: "Curated content from across all communities",
  },
  communities: {
    label: "Communities",
    heading: "For Your Communities",
    subtitle: "Posts from your communities",
  },
  events: {
    label: "Events",
    heading: "For Your Events",
    subtitle: "Upcoming events and your personal calendar",
  },
};

// ── Tab Icons ──────────────────────────────────────────────

function FriendsIcon({ active }: { active: boolean }) {
  return (
    <svg
      className="h-6 w-6"
      fill={active ? "currentColor" : "none"}
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
      />
    </svg>
  );
}

function ScrollIcon({ active }: { active: boolean }) {
  return (
    <svg
      className="h-6 w-6"
      fill={active ? "currentColor" : "none"}
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"
      />
    </svg>
  );
}

function CommunitiesIcon({ active }: { active: boolean }) {
  return (
    <svg
      className="h-6 w-6"
      fill={active ? "currentColor" : "none"}
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
  );
}

function EventsIcon({ active }: { active: boolean }) {
  return (
    <svg
      className="h-6 w-6"
      fill={active ? "currentColor" : "none"}
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
      />
    </svg>
  );
}

// ── Helper ─────────────────────────────────────────────────

function formatEventDate(dateString: string): string {
  const d = new Date(dateString);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  return days;
}

// ── Main Component ─────────────────────────────────────────

export default function FeedPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FeedTab>("communities");

  // Feed states
  const [communityPosts, setCommunityPosts] = useState<Post[]>([]);
  const [friendPosts, setFriendPosts] = useState<Post[]>([]);
  const [explorePosts, setExplorePosts] = useState<Post[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [myEvents, setMyEvents] = useState<EventItem[]>([]);
  const [communities, setCommunities] = useState<CommunityWithMembership[]>([]);

  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadingTab, setLoadingTab] = useState(false);

  // Calendar state
  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear, setCalYear] = useState(now.getFullYear());

  // ── Data loaders ──

  const loadCommunityFeed = useCallback(async () => {
    const [feedRes, commRes] = await Promise.all([
      fetch("/api/feed"),
      fetch("/api/communities?joined=true"),
    ]);
    const feedData = await feedRes.json();
    const commData = await commRes.json();
    setCommunityPosts(feedData.posts || []);
    setCommunities(commData.communities || []);
  }, []);

  const loadFriendsFeed = useCallback(async () => {
    const res = await fetch("/api/feed/friends");
    const data = await res.json();
    setFriendPosts(data.posts || []);
  }, []);

  const loadExploreFeed = useCallback(async () => {
    const res = await fetch("/api/feed/explore");
    const data = await res.json();
    setExplorePosts(data.posts || []);
  }, []);

  const loadEvents = useCallback(async () => {
    const res = await fetch("/api/events");
    const data = await res.json();
    setEvents(data.events || []);
    setMyEvents(data.myEvents || []);
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
      if (!cancelled) await loadCommunityFeed().finally(() => setLoadingFeed(false));
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
      if (tab === "scroll" && explorePosts.length === 0) await loadExploreFeed();
      if (tab === "communities" && communityPosts.length === 0) await loadCommunityFeed();
      if (tab === "events" && events.length === 0) await loadEvents();
    } catch (err) {
      console.error(`Failed to load ${tab} feed:`, err);
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

  // ── Calendar helper data ──

  const calendarDays = getCalendarDays(calYear, calMonth);
  const eventDates = new Set(
    myEvents.map((e) => {
      const d = new Date(e.event_date);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  );
  const monthName = new Date(calYear, calMonth).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

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
    switch (activeTab) {
      case "friends":
        return (
          <div className="space-y-6">
            <FriendRequestsPanel onFriendshipChanged={loadFriendsFeed} />
            {renderPostList(
              friendPosts,
              "No friend posts yet — visit someone's place to add them as a friend",
              {
                label: "Browse Communities to Meet People",
                href: "/communities",
              },
            )}
          </div>
        );

      case "scroll":
        return renderPostList(explorePosts, "Nothing to show yet — be the first to post!", {
          label: "Explore Communities",
          href: "/communities",
        });

      case "communities":
        return renderPostList(communityPosts, "Your feed is empty", {
          label: "Browse Communities",
          href: "/communities",
        });

      case "events":
        return (
          <div className="space-y-6">
            {loadingTab ? (
              <div className="flex justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-accent-500 border-t-transparent" />
              </div>
            ) : (
              <>
                {/* Mini Calendar */}
                <div className="op-card rounded-2xl border border-line bg-surface p-5">
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => {
                        if (calMonth === 0) {
                          setCalMonth(11);
                          setCalYear(calYear - 1);
                        } else setCalMonth(calMonth - 1);
                      }}
                      className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-emphasis"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 19.5 8.25 12l7.5-7.5"
                        />
                      </svg>
                    </button>
                    <h3 className="text-sm font-semibold text-ink">{monthName}</h3>
                    <button
                      onClick={() => {
                        if (calMonth === 11) {
                          setCalMonth(0);
                          setCalYear(calYear + 1);
                        } else setCalMonth(calMonth + 1);
                      }}
                      className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-emphasis"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m8.25 4.5 7.5 7.5-7.5 7.5"
                        />
                      </svg>
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center">
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                      <div key={d} className="text-xs font-medium text-ink-faint py-1">
                        {d}
                      </div>
                    ))}
                    {calendarDays.map((day, i) => {
                      const isToday =
                        day === now.getDate() &&
                        calMonth === now.getMonth() &&
                        calYear === now.getFullYear();
                      const hasEvent = day
                        ? eventDates.has(`${calYear}-${calMonth}-${day}`)
                        : false;
                      return (
                        <div
                          key={i}
                          className={`relative rounded-lg py-1.5 text-sm ${
                            !day
                              ? ""
                              : isToday
                                ? "bg-accent-500 text-ink-inverse font-bold"
                                : "text-ink-secondary hover:bg-surface-emphasis"
                          }`}
                        >
                          {day || ""}
                          {hasEvent && (
                            <span
                              className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${isToday ? "bg-surface" : "bg-accent-500"}`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Upcoming Events */}
                <div>
                  <h3 className="text-base font-semibold text-ink mb-3">Upcoming Events</h3>
                  {events.length > 0 ? (
                    <div className="space-y-3">
                      {events.map((event) => (
                        <div
                          key={event.id}
                          className="op-card rounded-2xl border border-line bg-surface p-5 transition-shadow hover:shadow-md"
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex flex-col items-center justify-center rounded-xl bg-accent-50 px-3 py-2 text-center shrink-0">
                              <span className="text-xs font-medium text-accent-600">
                                {new Date(event.event_date).toLocaleDateString("en-US", {
                                  month: "short",
                                })}
                              </span>
                              <span className="text-xl font-bold text-accent-700">
                                {new Date(event.event_date).getDate()}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-semibold text-ink">{event.title}</h4>
                              <p className="mt-0.5 text-xs text-ink-muted">
                                {formatEventDate(event.event_date)}
                              </p>
                              {event.location && (
                                <p className="mt-0.5 text-xs text-ink-faint flex items-center gap-1">
                                  <svg
                                    className="h-3 w-3"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={1.5}
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                                    />
                                  </svg>
                                  {event.location}
                                </p>
                              )}
                              {event.community_name && (
                                <p className="mt-1 text-xs text-accent-600">
                                  {event.community_icon} {event.community_name}
                                </p>
                              )}
                              <p className="mt-2 text-sm text-ink-tertiary line-clamp-2">
                                {event.description}
                              </p>
                              {event.rsvp_count !== undefined && event.rsvp_count > 0 && (
                                <p className="mt-2 text-xs text-ink-faint">
                                  {event.rsvp_count} going
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border-2 border-dashed border-line bg-surface p-12 text-center">
                      <h3 className="text-lg font-semibold text-ink">No upcoming events</h3>
                      <p className="mt-2 text-sm text-ink-muted">
                        Events from your communities will appear here.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
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
        <aside className="hidden lg:block w-72 shrink-0">
          <div className="sticky top-24 space-y-6">
            {/* My Communities */}
            <div className="op-card rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-ink">My Communities</h2>
                <Link href="/communities" className="text-xs text-accent-600 hover:text-accent-500">
                  View all
                </Link>
              </div>
              {communities.length > 0 ? (
                <div className="space-y-1">
                  {communities.slice(0, 8).map((community) => (
                    <Link
                      key={community.id}
                      href={`/communities/${community.slug}`}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-surface-muted"
                    >
                      <span className="text-lg">{community.icon}</span>
                      <span className="text-sm font-medium text-ink-secondary truncate">
                        {community.name}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-faint">No communities joined yet.</p>
              )}
              <Link
                href="/communities"
                className="mt-3 block rounded-xl bg-surface-muted py-2 text-center text-xs font-medium text-ink-tertiary hover:bg-surface-emphasis"
              >
                Discover More
              </Link>
            </div>

            {/* Quick Create */}
            <div className="op-tint rounded-2xl border border-line bg-gradient-to-br from-accent-50 to-purple-50 p-5">
              <h2 className="text-sm font-semibold text-ink">Start Something New</h2>
              <p className="mt-1 text-xs text-ink-muted">Can&apos;t find your community?</p>
              <Link
                href="/communities/create"
                className="mt-3 block rounded-xl bg-surface px-4 py-2 text-center text-sm font-medium text-accent-600 shadow-sm hover:shadow-md transition-shadow"
              >
                Create a Community
              </Link>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Bottom Dashboard Navigation (fixed on mobile, inline on desktop) ── */}
      <nav
        aria-label="Feed navigation"
        className="fixed bottom-0 inset-x-0 z-40 border-t border-line bg-surface/95 backdrop-blur-lg sm:static sm:mt-8 sm:rounded-2xl sm:border sm:bg-surface sm:shadow-sm"
      >
        <div className="mx-auto max-w-lg flex">
          {[
            { key: "friends" as FeedTab, Icon: FriendsIcon },
            { key: "scroll" as FeedTab, Icon: ScrollIcon },
            { key: "communities" as FeedTab, Icon: CommunitiesIcon },
            { key: "events" as FeedTab, Icon: EventsIcon },
          ].map(({ key, Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => switchTab(key)}
                aria-label={TAB_CONFIG[key].label}
                aria-current={active ? "page" : undefined}
                className={`flex-1 flex flex-col items-center gap-1 py-3 sm:py-4 transition-colors ${
                  active ? "text-accent-600" : "text-ink-faint hover:text-ink-tertiary"
                }`}
              >
                <Icon active={active} />
                <span
                  className={`text-[10px] sm:text-xs font-medium ${active ? "text-accent-600" : "text-ink-faint"}`}
                >
                  {TAB_CONFIG[key].label}
                </span>
                {active && (
                  <span className="absolute bottom-0 h-0.5 w-10 rounded-full bg-accent-500 sm:hidden" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
