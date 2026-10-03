"use client";

import CallControls from "@/components/calls/CallControls";
import CallFriendPicker from "@/components/calls/CallFriendPicker";
import { useCalls } from "@/components/calls/CallProvider";
import CallToasts from "@/components/calls/CallToasts";
import { MAX_CALL_SIZE } from "@/lib/types";

interface WorldCallHudProps {
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  /** A menu or overlay covers the world: the button steps aside like the
   * other corner buttons. Toasts still show. */
  buttonHidden: boolean;
}

function PhoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" />
    </svg>
  );
}

/**
 * Voice in the world: the phone button in the corner column (red while
 * you're live), the call sheet it opens, and call toasts. All of it lives
 * inside the world's frame, so it stays visible in full screen, where
 * nothing outside the frame is drawn.
 */
export default function WorldCallHud({
  sheetOpen,
  onSheetOpenChange,
  buttonHidden,
}: WorldCallHudProps) {
  const calls = useCalls();
  if (!calls.enabled) return null;
  const inCall = calls.link.status !== "idle";
  const live = inCall && calls.link.micOn;

  return (
    <>
      {!buttonHidden && (
        <button
          type="button"
          onClick={(e) => {
            // Hand focus back to the world, as the other corner buttons do.
            e.currentTarget.blur();
            onSheetOpenChange(!sheetOpen);
          }}
          aria-label={inCall ? "Your call" : "Call friends"}
          aria-expanded={sheetOpen}
          title={inCall ? "Your call" : "Call friends"}
          className={`absolute right-16 top-15 z-[5] flex h-11 w-11 touch-manipulation select-none items-center justify-center rounded-full border text-white ${
            live
              ? "border-red-300 bg-red-600 hover:bg-red-700"
              : inCall
                ? "border-white/60 bg-surface/30 hover:bg-surface/40"
                : "border-white/25 bg-surface/10 hover:bg-surface/20 active:bg-surface/25"
          }`}
        >
          <PhoneIcon />
        </button>
      )}
      {sheetOpen && (
        <div
          role="dialog"
          aria-label={inCall ? "Your call" : "Call friends"}
          className="absolute right-2 top-28 z-40 max-h-[calc(100%-7.5rem)] w-[min(20rem,calc(100%-1rem))] overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-lg"
        >
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => onSheetOpenChange(false)}
              aria-label="Close"
              className="-mr-1 -mt-1 rounded-md px-2 text-lg leading-none text-ink-faint hover:text-ink"
            >
              ×
            </button>
          </div>
          <CallToasts placement="sheet" />
          {inCall ? (
            <CallControls />
          ) : calls.ghost ? (
            <p className="text-sm text-ink-secondary">
              Ghost Mode is on, so you can&apos;t be in a call. Turn it off at your armoire first.
            </p>
          ) : (
            <>
              <p className="mb-2 text-sm font-semibold text-ink">Call friends</p>
              <CallFriendPicker
                max={MAX_CALL_SIZE - 1}
                submitLabel="Call"
                busy={calls.busy}
                onSubmit={(usernames) => void calls.start(usernames)}
                onCancel={() => onSheetOpenChange(false)}
              />
            </>
          )}
        </div>
      )}
      {!sheetOpen && <CallToasts placement="world" />}
    </>
  );
}
