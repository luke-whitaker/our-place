"use client";

import { useEffect, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { MAX_PICKED_INVITEES } from "@/lib/types";
import type { FriendEntry, PeopleEntry } from "@/lib/types";

export interface Invitee {
  id: string;
  username: string;
  display_name: string;
}

interface InviteePickerProps {
  value: Invitee[];
  onChange: (invitees: Invitee[]) => void;
  /** The host, left out of the results: they're always going. */
  selfUsername: string;
  label: string;
  hint?: string;
}

/** How long to wait after typing stops before searching. */
const SEARCH_DELAY_MS = 250;

const chipClass =
  "rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * Pick members to invite: tap friends from a list, or search the same
 * directory the People page uses for anyone else.
 */
export default function InviteePicker({
  value,
  onChange,
  selfUsername,
  label,
  hint,
}: InviteePickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PeopleEntry[]>([]);
  const [friends, setFriends] = useState<Invitee[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{ friends: FriendEntry[] }>("/api/friends");
        if (cancelled) return;
        setFriends(
          data.friends
            .map((f) => ({ id: f.user_id, username: f.username, display_name: f.display_name }))
            .sort((a, b) => a.display_name.localeCompare(b.display_name)),
        );
      } catch (err) {
        if (!cancelled) setError(userMessage(err, "Couldn't load your friends."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const search = query.trim();
    // An empty box hides the results at render (`shown`) instead of clearing
    // state here, which React would re-render for twice.
    if (!search) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ search, limit: "8" });
          const data = await apiFetch<{ users: PeopleEntry[] }>(`/api/users?${params}`);
          if (!cancelled) {
            setResults(data.users);
            setError("");
          }
        } catch (err) {
          if (!cancelled) setError(userMessage(err, "Couldn't search members."));
        }
      })();
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const chosen = new Set(value.map((v) => v.id));
  const full = value.length >= MAX_PICKED_INVITEES;
  const shown = query.trim() ? results : [];
  const friendIds = new Set(friends?.map((f) => f.id));
  // Two friends can share a display name; their @usernames tell them apart.
  const names = friends?.map((f) => f.display_name) ?? [];
  const shared = new Set(names.filter((n, i) => names.indexOf(n) !== i));
  // Friends are chosen from their own list, so the chips above the search
  // show only people found by searching.
  const others = value.filter((v) => !friendIds.has(v.id));

  function toggle(person: Invitee) {
    onChange(chosen.has(person.id) ? value.filter((v) => v.id !== person.id) : [...value, person]);
  }

  return (
    <div>
      <p className="mb-1.5 block text-sm font-medium text-ink-secondary">{label}</p>
      {hint && <p className="mb-2 text-xs text-ink-faint">{hint}</p>}

      {friends && friends.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs text-ink-muted">Your friends</p>
          <ul className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {friends.map((friend) => {
              const on = chosen.has(friend.id);
              return (
                <li key={friend.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    title={`@${friend.username}`}
                    disabled={!on && full}
                    onClick={() => toggle(friend)}
                    className={`${chipClass} ${
                      on
                        ? "border-accent-500 bg-accent-500 text-ink-inverse"
                        : "border-line bg-surface text-ink-secondary hover:bg-surface-emphasis"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {friend.display_name}
                    {shared.has(friend.display_name) && (
                      <span className="opacity-70"> @{friend.username}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {others.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {others.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-1 rounded-full border border-line bg-surface-emphasis px-2.5 py-1 text-xs text-ink-secondary"
            >
              {person.display_name}
              <button
                type="button"
                onClick={() => toggle(person)}
                aria-label={`Remove ${person.display_name}`}
                className="ml-1 text-ink-faint hover:text-red-600"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor="invitee-search" className="sr-only">
        Search members
      </label>
      <input
        id="invitee-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          full ? `Up to ${MAX_PICKED_INVITEES} people` : "Search for anyone else by name"
        }
        disabled={full}
        className="w-full rounded-xl border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
      />
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
      {shown.length > 0 && (
        <ul className="mt-1 divide-y divide-line-soft rounded-xl border border-line">
          {shown
            .filter((p) => p.username !== selfUsername)
            .map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  disabled={chosen.has(person.id) || full}
                  onClick={() => {
                    toggle(person);
                    setQuery("");
                  }}
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-ink-secondary hover:bg-surface-emphasis disabled:opacity-50"
                >
                  <span>
                    {person.display_name}{" "}
                    <span className="text-xs text-ink-faint">@{person.username}</span>
                  </span>
                  {chosen.has(person.id) && <span className="text-xs text-ink-faint">Added</span>}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
