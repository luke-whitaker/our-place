"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch, userMessage } from "@/lib/api-client";

/** The unsubscribe page's one button, and what happened when it was pressed. */
export default function UnsubscribeConfirm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  async function stop() {
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch<{ message: string }>(
        `/api/unsubscribe?token=${encodeURIComponent(token)}`,
        { method: "POST", redirectOnUnauthorized: false },
      );
      setDone(data.message);
    } catch (err) {
      setError(userMessage(err, "Couldn't turn gathering emails off. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <p role="status" className="mt-3 text-sm text-ink-muted">
          {done}
        </p>
        <p className="mt-3 text-sm text-ink-muted">
          Changed your mind? Turn them back on in Account settings, under My Account.
        </p>
        <Link
          href="/profile?tab=account"
          className="mt-6 inline-block rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-muted"
        >
          Go to Account settings
        </Link>
      </>
    );
  }

  return (
    <>
      <p className="mt-3 text-sm text-ink-muted">
        Stop getting emails when you&apos;re invited to a gathering, when one&apos;s time changes,
        or when one is cancelled? Your notifications on Our Place still show all of it.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        onClick={stop}
        disabled={busy || !token}
        className="mt-6 rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-medium text-ink-inverse hover:bg-accent-600 disabled:opacity-50"
      >
        {busy ? "Turning them off..." : "Stop gathering emails"}
      </button>
      {!token && (
        <p className="mt-3 text-sm text-ink-faint">
          This link is missing its code. You can turn emails off in Account settings.
        </p>
      )}
    </>
  );
}
