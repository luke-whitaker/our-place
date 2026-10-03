"use client";

import { useCalls } from "@/components/calls/CallProvider";

/** "Call" on a friend's row: starts a call with just them. You can invite
 * more once you're in. Hidden when voice is off on this server. */
export default function CallFriendButton({
  username,
  displayName,
}: {
  username: string;
  displayName: string;
}) {
  const calls = useCalls();
  if (!calls.enabled) return null;
  const inCall = calls.link.status !== "idle";

  return (
    <button
      type="button"
      onClick={() => void calls.start([username])}
      disabled={calls.busy || inCall}
      aria-label={`Call ${displayName}`}
      title={
        calls.ghost
          ? "Ghost Mode is on. Turn it off at your armoire to call."
          : inCall
            ? "You're already in a call. Invite them from the call."
            : undefined
      }
      className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-emphasis disabled:opacity-50"
    >
      Call
    </button>
  );
}
