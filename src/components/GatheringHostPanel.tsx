"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch, userMessage } from "@/lib/api-client";
import GatheringTimeForm from "@/components/GatheringTimeForm";
import type { GatheringDetail, GatheringPerson } from "@/lib/types";

function People({ title, people }: { title: string; people: GatheringPerson[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
        {title} ({people.length})
      </h3>
      {people.length === 0 ? (
        <p className="mt-1 text-sm text-ink-faint">Nobody yet.</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {people.map((p) => (
            <li key={p.username} className="text-sm text-ink-secondary">
              <Link href={`/profile/${p.username}`} className="hover:text-accent-600">
                {p.display_name}
              </Link>{" "}
              <span className="text-xs text-ink-faint">@{p.username}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The host's view: everyone's answers, changing the time before it starts,
 * and cancelling before it ends. */
export default function GatheringHostPanel({
  gathering,
  onChanged,
}: {
  gathering: GatheringDetail;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ended = gathering.ended;

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/gatherings/${gathering.id}/cancel`, { method: "POST" });
      onChanged();
    } catch (err) {
      setError(userMessage(err, "Couldn't cancel the gathering."));
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <section className="op-card rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">Guest list</h2>
      <p className="mt-0.5 text-xs text-ink-muted">
        Everyone invited and their answer. Only you see who hasn&apos;t answered or declined.
      </p>
      {gathering.attendees && (
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <People title="Going" people={gathering.attendees.accepted} />
          <People title="Not answered" people={gathering.attendees.pending} />
          <People title="Declined" people={gathering.attendees.declined} />
        </div>
      )}

      {gathering.status === "scheduled" && !gathering.started && (
        <div className="mt-5 border-t border-line-soft pt-4">
          <GatheringTimeForm gathering={gathering} onChanged={onChanged} />
        </div>
      )}

      {gathering.status === "scheduled" && !ended && (
        <div className="mt-5 border-t border-line-soft pt-4">
          {error && (
            <p role="alert" className="mb-2 text-sm text-red-600">
              {error}
            </p>
          )}
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-ink-secondary">
                Cancel this gathering? Everyone going will be told.
              </p>
              <button
                onClick={cancel}
                disabled={busy}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Cancelling..." : "Yes, cancel it"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-emphasis"
              >
                Keep it
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              Cancel gathering
            </button>
          )}
        </div>
      )}
    </section>
  );
}
