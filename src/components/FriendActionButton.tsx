"use client";

import { useState } from "react";
import type { FriendshipStatus } from "@/lib/types";

const primaryClass =
  "rounded-xl bg-accent-500 px-4 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-accent-600 disabled:opacity-50";
const secondaryClass =
  "rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-emphasis disabled:opacity-50";

// The friend-relationship control on someone's My Place: send / cancel /
// accept / decline / unfriend, depending on where the two of you stand.
export default function FriendActionButton({
  status,
  friendshipId,
  username,
  displayName,
  onChanged,
}: {
  status: FriendshipStatus;
  friendshipId: string | null;
  username: string;
  displayName: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, init);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      onChanged();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const sendRequest = () =>
    call("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
  const accept = () => call(`/api/friends/${friendshipId}`, { method: "PATCH" });
  const removeFriendship = (confirmText: string | null) => {
    if (confirmText && !window.confirm(confirmText)) return;
    void call(`/api/friends/${friendshipId}`, { method: "DELETE" });
  };

  if (status === "self") return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {status === "none" && (
          <button onClick={sendRequest} disabled={busy} className={primaryClass}>
            Add Friend
          </button>
        )}
        {status === "pending_outgoing" && (
          <button
            onClick={() => removeFriendship(null)}
            disabled={busy}
            title="Cancel your friend request"
            className={secondaryClass}
          >
            Request Sent — Cancel
          </button>
        )}
        {status === "pending_incoming" && (
          <>
            <button onClick={accept} disabled={busy} className={primaryClass}>
              Accept Request
            </button>
            <button
              onClick={() => removeFriendship(null)}
              disabled={busy}
              className={secondaryClass}
            >
              Decline
            </button>
          </>
        )}
        {status === "friends" && (
          <button
            onClick={() => removeFriendship(`Remove ${displayName} as a friend?`)}
            disabled={busy}
            title="Remove friend"
            className={secondaryClass}
          >
            ✓ Friends
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
