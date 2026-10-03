"use client";

import { useEffect, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import type { FriendEntry } from "@/lib/types";

interface CallFriendPickerProps {
  /** How many may be picked: 7 to start a call, the room left to invite. */
  max: number;
  /** Friends already in or invited to the call, left out of the list. */
  exclude?: ReadonlySet<string>;
  submitLabel: string;
  busy: boolean;
  onSubmit: (usernames: string[]) => void;
  onCancel: () => void;
}

const chipClass =
  "rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/** Pick friends to call or to invite into a call. Only your own friends,
 * which is the rule the server holds too. */
export default function CallFriendPicker({
  max,
  exclude,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: CallFriendPickerProps) {
  const [friends, setFriends] = useState<FriendEntry[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ friends: FriendEntry[] }>("/api/friends")
      .then((data) => {
        if (!cancelled) {
          setFriends(
            [...data.friends].sort((a, b) => a.display_name.localeCompare(b.display_name)),
          );
        }
      })
      .catch((err) => {
        if (!cancelled) setError(userMessage(err, "Couldn't load your friends."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = friends?.filter((f) => !exclude?.has(f.username)) ?? [];
  const full = picked.length >= max;

  function toggle(username: string) {
    setPicked((prev) =>
      prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username],
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-muted">
        {max === 1 ? "Pick a friend." : `Pick up to ${max} friends.`}
      </p>
      {friends === null && !error && (
        <p className="text-sm text-ink-faint">Finding your friends…</p>
      )}
      {friends !== null && shown.length === 0 && (
        <p className="text-sm text-ink-muted">No friends left to add.</p>
      )}
      {shown.length > 0 && (
        <ul className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          {shown.map((friend) => {
            const on = picked.includes(friend.username);
            return (
              <li key={friend.username}>
                <button
                  type="button"
                  aria-pressed={on}
                  title={`@${friend.username}`}
                  disabled={!on && full}
                  onClick={() => toggle(friend.username)}
                  className={`${chipClass} ${
                    on
                      ? "border-accent-500 bg-accent-500 text-ink-inverse"
                      : "border-line bg-surface text-ink-secondary hover:bg-surface-emphasis"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {friend.display_name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={picked.length === 0 || busy}
          onClick={() => onSubmit(picked)}
          className="rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-medium text-ink-inverse hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "One moment…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-secondary hover:bg-surface-emphasis"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
