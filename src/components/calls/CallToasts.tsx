"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useCalls } from "@/components/calls/CallProvider";
import { INVITE_TOAST_MS, inviteToastText } from "@/lib/call-display";
import type { CallInvitation } from "@/lib/types";

const cardClass =
  "pointer-events-auto rounded-xl border border-line bg-surface p-3 text-sm text-ink shadow-lg";
const primaryClass =
  "rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-medium text-ink-inverse hover:brightness-110 disabled:opacity-50";
const secondaryClass =
  "rounded-lg border border-line px-3 py-1.5 text-sm text-ink-secondary hover:bg-surface-emphasis";

/** One invitation, up for INVITE_TOAST_MS before it tucks itself away. It
 * stays in the notifications inbox either way. */
function InviteToast({ invitation }: { invitation: CallInvitation }) {
  const calls = useCalls();
  const { hideInvitation } = calls;
  const callId = invitation.call_id;

  useEffect(() => {
    const timer = setTimeout(() => hideInvitation(callId), INVITE_TOAST_MS);
    return () => clearTimeout(timer);
  }, [hideInvitation, callId]);

  return (
    <div role="alert" className={cardClass}>
      <p>{inviteToastText(invitation)}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={calls.busy}
          onClick={() => calls.join(callId)}
          className={primaryClass}
        >
          Join
        </button>
        <button type="button" onClick={() => calls.decline(callId)} className={secondaryClass}>
          Decline
        </button>
      </div>
    </div>
  );
}

/** Offered after a drop, or after a reload while the server still counts
 * this member in a call. Rejoining never opens the microphone by itself. */
function RejoinCard() {
  const calls = useCalls();
  return (
    <div role="alert" className={cardClass}>
      <p>You&apos;re not connected to your call.</p>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={calls.busy} onClick={calls.rejoin} className={primaryClass}>
          Tap to rejoin
        </button>
        <button type="button" onClick={calls.dismissRejoin} className={secondaryClass}>
          Leave the call
        </button>
      </div>
    </div>
  );
}

/** Where the toasts go: floating at the bottom of a page, floating in the
 * world's frame, or in line at the top of the world's open call sheet. */
const POSITION = {
  page: "fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-sm",
  world: "absolute inset-x-2 top-28 z-30 mx-auto max-w-sm",
  sheet: "mb-3",
} as const;

/**
 * Call invitations, the rejoin offer, and call notices. "page" floats at the
 * bottom of every page but the world; "world" sits inside the world's frame
 * (so it shows in full screen), below the corner buttons and above the touch
 * controls; "sheet" goes inside the world's call sheet while it's open, so
 * the two never cover each other on a phone.
 */
export default function CallToasts({ placement }: { placement: keyof typeof POSITION }) {
  const calls = useCalls();
  const inWorld = usePathname() === "/world";
  if (!calls.enabled || (placement === "page" && inWorld)) return null;
  const empty = calls.invitations.length === 0 && !calls.rejoinCallId && !calls.notice;
  if (empty) return null;
  const position = POSITION[placement];

  return (
    <div className={`pointer-events-none flex flex-col gap-2 ${position}`}>
      {calls.invitations.map((invitation) => (
        <InviteToast key={invitation.call_id} invitation={invitation} />
      ))}
      {calls.rejoinCallId && <RejoinCard />}
      {calls.notice && (
        <div role="status" className={`${cardClass} flex items-start justify-between gap-2`}>
          <p>{calls.notice}</p>
          <button
            type="button"
            onClick={calls.dismissNotice}
            aria-label="Dismiss"
            className="shrink-0 text-ink-faint hover:text-ink"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
