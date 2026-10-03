"use client";

import { useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { toLocalInput } from "@/lib/time-utils";
import type { GatheringDetail } from "@/lib/types";

const inputClass =
  "w-full rounded-xl border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400";
const labelClass = "mb-1.5 block text-sm font-medium text-ink-secondary";

/**
 * The host's "Change date and time", until the gathering starts. Opens on a
 * tap, prefilled with the current times in the browser's zone. Everyone still
 * invited is told in the site and by email; answers stay as they were.
 */
export default function GatheringTimeForm({
  gathering,
  onChanged,
}: {
  gathering: GatheringDetail;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [starts, setStarts] = useState(() => toLocalInput(new Date(gathering.starts_at)));
  const [ends, setEnds] = useState(() => toLocalInput(new Date(gathering.ends_at)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/gatherings/${gathering.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          starts_at: new Date(starts).toISOString(),
          ends_at: new Date(ends).toISOString(),
        }),
      });
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(userMessage(err, "Couldn't change the time."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-emphasis"
      >
        Change date and time
      </button>
    );
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="g-new-starts" className={labelClass}>
            Starts
          </label>
          <input
            id="g-new-starts"
            type="datetime-local"
            value={starts}
            onChange={(e) => setStarts(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="g-new-ends" className={labelClass}>
            Ends
          </label>
          <input
            id="g-new-ends"
            type="datetime-local"
            value={ends}
            onChange={(e) => setEnds(e.target.value)}
            required
            className={inputClass}
          />
        </div>
      </div>
      <p className="text-xs text-ink-muted">
        Everyone invited gets a notification and an email with the new time. Answers stay as they
        are, and anyone who can&apos;t make it can change theirs.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-inverse hover:bg-accent-600 disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save the new time"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-emphasis"
        >
          Keep the old time
        </button>
      </div>
    </form>
  );
}
