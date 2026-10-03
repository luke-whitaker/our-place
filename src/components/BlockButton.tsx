"use client";

import { useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";

const quietClass =
  "rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-emphasis disabled:opacity-50";

/** What a block does, in the words the confirm shows before it happens. */
export const BLOCK_EXPLAINER =
  "You won't be friends, and neither of you can send letters, invitations, or friend requests, comment on each other's posts, or see each other in the world. They aren't told.";

// Block or unblock someone from their My Place. Only ever reflects blocks the
// viewer made; whether they were blocked themselves is never shown.
export default function BlockButton({
  username,
  displayName,
  blocked,
  onChanged,
}: {
  username: string;
  displayName: string;
  blocked: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    if (!blocked && !window.confirm(`Block ${displayName}?\n\n${BLOCK_EXPLAINER}`)) return;
    setBusy(true);
    setError("");
    try {
      if (blocked) {
        await apiFetch(`/api/blocks/${encodeURIComponent(username)}`, { method: "DELETE" });
      } else {
        await apiFetch("/api/blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });
      }
      onChanged();
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={() => void toggle()} disabled={busy} className={quietClass}>
        {blocked ? "Unblock" : "Block"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
