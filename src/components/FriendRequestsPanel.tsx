"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { FriendEntry } from "@/lib/types";

function PersonChip({ person }: { person: FriendEntry }) {
  return (
    <Link href={`/profile/${person.username}`} className="group flex min-w-0 items-center gap-2.5">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-inverse text-xs font-bold"
        style={{ backgroundColor: person.avatar_color || "#6366f1" }}
      >
        {person.display_name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink group-hover:text-accent-600">
          {person.display_name}
        </p>
        <p className="text-xs text-ink-faint">@{person.username}</p>
      </div>
    </Link>
  );
}

// Pending friend requests, shown above the Friends feed. Self-loading and
// self-hiding: renders nothing when there are no requests either way.
export default function FriendRequestsPanel({
  onFriendshipChanged,
}: {
  onFriendshipChanged: () => void;
}) {
  const [incoming, setIncoming] = useState<FriendEntry[]>([]);
  const [outgoing, setOutgoing] = useState<FriendEntry[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/friends");
      const data = await res.json();
      if (res.ok) {
        setIncoming(data.incoming || []);
        setOutgoing(data.outgoing || []);
      }
    } catch {
      // Non-fatal: the panel stays hidden and the feed still renders.
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function act(friendshipId: string, method: "PATCH" | "DELETE") {
    setBusyId(friendshipId);
    setError("");
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, { method });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      await load();
      // Accepting adds a friend, so their posts belong in the feed now.
      if (method === "PATCH") onFriendshipChanged();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  if (incoming.length === 0 && outgoing.length === 0) return null;

  return (
    <div className="op-card rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">Friend Requests</h2>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {incoming.length > 0 && (
        <div className="mt-3 space-y-3">
          {incoming.map((person) => (
            <div key={person.friendship_id} className="flex items-center justify-between gap-3">
              <PersonChip person={person} />
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => act(person.friendship_id, "PATCH")}
                  disabled={busyId === person.friendship_id}
                  className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-inverse transition-colors hover:bg-accent-600 disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  onClick={() => act(person.friendship_id, "DELETE")}
                  disabled={busyId === person.friendship_id}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-emphasis disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-line-soft pt-3">
          <p className="text-xs text-ink-faint">Sent by you</p>
          {outgoing.map((person) => (
            <div key={person.friendship_id} className="flex items-center justify-between gap-3">
              <PersonChip person={person} />
              <button
                onClick={() => act(person.friendship_id, "DELETE")}
                disabled={busyId === person.friendship_id}
                className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-emphasis disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
