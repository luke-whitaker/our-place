"use client";

import { useEffect, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { MAX_PICKED_INVITEES } from "@/lib/types";
import type { PeopleEntry } from "@/lib/types";

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
}

/** How long to wait after typing stops before searching. */
const SEARCH_DELAY_MS = 250;

/** Pick members to invite, searching the same directory the People page uses. */
export default function InviteePicker({ value, onChange, selfUsername }: InviteePickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PeopleEntry[]>([]);
  const [error, setError] = useState("");

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

  return (
    <div>
      <label
        htmlFor="invitee-search"
        className="mb-1.5 block text-sm font-medium text-ink-secondary"
      >
        Who&apos;s invited
      </label>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {value.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-1 rounded-full border border-line bg-surface-emphasis px-2.5 py-1 text-xs text-ink-secondary"
            >
              {person.display_name}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v.id !== person.id))}
                aria-label={`Remove ${person.display_name}`}
                className="ml-1 text-ink-faint hover:text-red-600"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id="invitee-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={full ? `Up to ${MAX_PICKED_INVITEES} people` : "Search members by name"}
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
                    onChange([...value, person]);
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
