"use client";

/**
 * The "you're live" mark: a red dot and "Live" whenever this member's
 * microphone is sending, "Muted" when it isn't. Shown for as long as they're
 * connected to a call, wherever the call's controls are, and never hidden.
 */
export default function LiveIndicator({ micOn }: { micOn: boolean }) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
        micOn ? "bg-red-600 text-white" : "bg-surface-emphasis text-ink-secondary"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${micOn ? "animate-pulse bg-white" : "bg-ink-faint"}`}
      />
      {micOn ? "Live" : "Muted"}
    </span>
  );
}
