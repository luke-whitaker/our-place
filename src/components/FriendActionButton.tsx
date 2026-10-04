"use client";

import { useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { confirmAndBlock } from "@/components/BlockButton";
import type { FriendshipStatus } from "@/lib/types";

const primaryClass =
  "rounded-xl bg-accent-500 px-4 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-accent-600 disabled:opacity-50";
const menuItemClass =
  "block w-full px-4 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-emphasis";
const secondaryClass =
  "rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-emphasis disabled:opacity-50";

// The friend-relationship control on someone's My Place: send / cancel /
// accept / decline, depending on where the two of you stand. Between friends
// it's a "Friends" tag that opens a small menu with Unfriend and Block.
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
  const [menuOpen, setMenuOpen] = useState(false);

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(url, init);
      onChanged();
    } catch (err) {
      setError(userMessage(err));
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

  async function block() {
    setMenuOpen(false);
    setError("");
    try {
      if (await confirmAndBlock(username, displayName)) onChanged();
    } catch (err) {
      setError(userMessage(err));
    }
  }

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
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              disabled={busy}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={`${secondaryClass} whitespace-nowrap`}
            >
              ✓ Friends ▾
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg"
                >
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      removeFriendship(`Unfriend ${displayName}?`);
                    }}
                    className={menuItemClass}
                  >
                    Unfriend
                  </button>
                  <button role="menuitem" onClick={() => void block()} className={menuItemClass}>
                    Block
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
