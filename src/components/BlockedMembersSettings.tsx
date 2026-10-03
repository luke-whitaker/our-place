"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, userMessage } from "@/lib/api-client";
import type { BlockedMember } from "@/lib/types";

// The Account tab's list of members the viewer blocked, each with Unblock.
// Blocking itself happens on a member's My Place.
export default function BlockedMembersSettings() {
  const [blocked, setBlocked] = useState<BlockedMember[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{ blocked: BlockedMember[] }>("/api/blocks");
        if (!cancelled) setBlocked(data.blocked);
      } catch (err) {
        if (!cancelled) setError(userMessage(err, "Couldn't load the members you blocked."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function unblock(member: BlockedMember) {
    setBusy(member.username);
    setError("");
    setSuccess("");
    try {
      await apiFetch(`/api/blocks/${encodeURIComponent(member.username)}`, { method: "DELETE" });
      setBlocked((list) => list?.filter((b) => b.username !== member.username) ?? null);
      setSuccess(`You unblocked ${member.display_name}.`);
    } catch (err) {
      setError(userMessage(err, "Failed to unblock that member."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="py-2">
      <p className="text-sm font-medium text-ink-secondary">Blocked members</p>
      <p className="text-sm text-ink-faint">
        People you blocked can&apos;t reach you, and you can&apos;t reach them. Unblocking
        doesn&apos;t make you friends again.
      </p>
      {blocked && blocked.length === 0 && (
        <p className="mt-2 text-sm text-ink-muted">You haven&apos;t blocked anyone.</p>
      )}
      {blocked && blocked.length > 0 && (
        <ul className="mt-3 space-y-2">
          {blocked.map((member) => (
            <li key={member.username} className="flex items-center justify-between gap-3">
              <Link
                href={`/profile/${member.username}`}
                className="flex min-w-0 items-center gap-2 text-sm text-ink hover:underline"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-ink-inverse"
                  style={{ backgroundColor: member.avatar_color }}
                >
                  {member.display_name.charAt(0).toUpperCase()}
                </span>
                <span className="truncate">{member.display_name}</span>
                <span className="truncate text-ink-muted">@{member.username}</span>
              </Link>
              <button
                type="button"
                onClick={() => void unblock(member)}
                disabled={busy !== null}
                className="shrink-0 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-emphasis disabled:opacity-50"
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
      {success && (
        <p role="status" className="mt-2 text-sm text-green-700">
          {success}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
