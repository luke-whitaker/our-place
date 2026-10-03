"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import CallControls from "@/components/calls/CallControls";
import { useCalls } from "@/components/calls/CallProvider";
import LiveIndicator from "@/components/calls/LiveIndicator";

/**
 * The navbar's call bar while connected to a call: the Live indicator and
 * how many are in, opening the call's controls. The world has its own call
 * button inside its frame, so this steps aside there.
 */
export default function NavbarCall() {
  const calls = useCalls();
  const inWorld = usePathname() === "/world";
  const [open, setOpen] = useState(false);
  const { link } = calls;
  if (!calls.enabled || inWorld || link.status === "idle") return null;
  const count = link.status === "connected" ? link.connected.size + 1 : null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Your call"
        className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-2.5 transition-colors hover:bg-surface-emphasis"
      >
        <LiveIndicator micOn={link.micOn} />
        <span className="text-xs text-ink-secondary">
          {count === null ? "Joining…" : `${count} in call`}
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-4 shadow-lg">
            <CallControls />
          </div>
        </>
      )}
    </div>
  );
}
