"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import FriendRequestsPanel from "@/components/FriendRequestsPanel";
import FriendActionButton from "@/components/FriendActionButton";
import { apiFetch, userMessage } from "@/lib/api-client";
import type { FriendEntry, PeopleEntry } from "@/lib/types";

const DIRECTORY_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 250;

function AvatarCircle({ color, name }: { color: string; name: string }) {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-inverse text-sm font-bold"
      style={{ backgroundColor: color || "#6366f1" }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function FriendRow({ friend, onRemoved }: { friend: FriendEntry; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!window.confirm(`Remove ${friend.display_name} as a friend?`)) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/friends/${friend.friendship_id}`, { method: "DELETE" });
      onRemoved();
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <AvatarCircle color={friend.avatar_color} name={friend.display_name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{friend.display_name}</p>
          <Link
            href={`/profile/${friend.username}`}
            className="text-xs text-ink-faint hover:text-accent-600"
          >
            @{friend.username}
          </Link>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          onClick={() => void remove()}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-emphasis disabled:opacity-50"
        >
          Remove
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

// A directory row's friendship control is the shared FriendActionButton — it
// already returns null for your own row (status "self"), so there's nothing
// extra to check here.
function DirectoryRow({ person, onChanged }: { person: PeopleEntry; onChanged: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <AvatarCircle color={person.avatar_color} name={person.display_name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{person.display_name}</p>
          <Link
            href={`/profile/${person.username}`}
            className="text-xs text-ink-faint hover:text-accent-600"
          >
            @{person.username}
          </Link>
          <p className="text-xs text-ink-faint">
            {person.invited_by ? `Invited by ${person.invited_by.display_name}` : "Founding member"}
          </p>
        </div>
      </div>
      <FriendActionButton
        status={person.friendship.status}
        friendshipId={person.friendship.id}
        username={person.username}
        displayName={person.display_name}
        onChanged={onChanged}
      />
    </div>
  );
}

// The member directory: friend requests, your accepted friends, and every
// account on the platform, searchable. Auth-gated the same way as /feed.
export default function PeoplePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [friendsError, setFriendsError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [directory, setDirectory] = useState<PeopleEntry[]>([]);
  const [directoryPage, setDirectoryPage] = useState(1);
  const [directoryHasMore, setDirectoryHasMore] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadFriends = useCallback(async () => {
    try {
      const data = await apiFetch<{ friends: FriendEntry[] }>("/api/friends");
      setFriends(data.friends || []);
      setFriendsError("");
    } catch (err) {
      setFriendsError(userMessage(err, "Couldn't load your friends."));
    }
  }, []);

  const loadDirectoryPage = useCallback(
    async (term: string, page: number, mode: "replace" | "append") => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(DIRECTORY_PAGE_SIZE),
        });
        if (term) params.set("search", term);
        const data = await apiFetch<{ users: PeopleEntry[]; hasMore: boolean }>(
          `/api/users?${params.toString()}`,
        );
        setDirectory((prev) => (mode === "append" ? [...prev, ...data.users] : data.users));
        setDirectoryHasMore(data.hasMore);
        setDirectoryPage(page);
        setDirectoryError("");
      } catch (err) {
        setDirectoryError(userMessage(err, "Couldn't load the directory."));
      }
    },
    [],
  );

  // Any friendship change (accept, decline, cancel, remove, send) can move a
  // person between "Your friends" and "Everyone", so refresh both. The
  // directory resets to page one rather than re-fetching every loaded page.
  const refreshAfterFriendshipChange = useCallback(() => {
    void loadFriends();
    void loadDirectoryPage(debouncedSearch, 1, "replace");
  }, [loadFriends, loadDirectoryPage, debouncedSearch]);

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
      await Promise.all([loadFriends(), loadDirectoryPage("", 1, "replace")]);
      if (!cancelled) setLoadingPage(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, router, loadFriends, loadDirectoryPage]);

  // Debounce the search box before it hits the server.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  // Re-query on debounced term changes, skipping the redundant call on mount
  // (the auth-gate effect above already fetches page one).
  const isFirstSearch = useRef(true);
  useEffect(() => {
    if (isFirstSearch.current) {
      isFirstSearch.current = false;
      return;
    }
    void loadDirectoryPage(debouncedSearch, 1, "replace");
  }, [debouncedSearch, loadDirectoryPage]);

  async function handleShowMore() {
    setLoadingMore(true);
    await loadDirectoryPage(debouncedSearch, directoryPage + 1, "append");
    setLoadingMore(false);
  }

  if (loading || loadingPage || !user || !user.avatar) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-ink">People</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Everyone on Our Place, and where things stand between you.
      </p>

      <div className="mt-8 space-y-8">
        <FriendRequestsPanel onFriendshipChanged={refreshAfterFriendshipChange} />

        <section>
          <h2 className="text-lg font-semibold text-ink mb-3">Your Friends</h2>
          {friendsError && <p className="mb-2 text-sm text-red-600">{friendsError}</p>}
          {friends.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No friends yet. Everyone below is one request away.
            </p>
          ) : (
            <div className="divide-y divide-line-soft rounded-2xl border border-line bg-surface px-4">
              {friends.map((friend) => (
                <FriendRow
                  key={friend.friendship_id}
                  friend={friend}
                  onRemoved={refreshAfterFriendshipChange}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink mb-3">Everyone</h2>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or username"
            aria-label="Search people"
            className="mb-3 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
          {directoryError && <p className="mb-2 text-sm text-red-600">{directoryError}</p>}
          {directory.length === 0 ? (
            <p className="text-sm text-ink-muted">No one matches your search.</p>
          ) : (
            <div className="divide-y divide-line-soft rounded-2xl border border-line bg-surface px-4">
              {directory.map((person) => (
                <DirectoryRow
                  key={person.id}
                  person={person}
                  onChanged={refreshAfterFriendshipChange}
                />
              ))}
            </div>
          )}
          {directoryHasMore && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => void handleShowMore()}
                disabled={loadingMore}
                className="rounded-xl border border-line bg-surface px-5 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-emphasis disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Show more"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
