"use client";

import { useId, type ReactNode } from "react";
import { PAL } from "@/lib/game/constants";

interface OverlayPanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * <OverlayPanel /> — the shared HUD-styled modal chrome for the world's DOM
 * overlays (Pockets, the Notebook): the same backdrop, bordered panel, and
 * title bar with a 44px close button that WorldMenu draws for the PC and
 * shrine menus, so every panel the world opens reads as the same terminal.
 * `max-h-full` + `overflow-y-auto` is what lets a phone held sideways fit any
 * panel without page scroll.
 */
export default function OverlayPanel({ title, onClose, children }: OverlayPanelProps) {
  const titleId = useId();
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 px-2 py-1"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-full w-full max-w-2xl flex-col gap-2 overflow-y-auto rounded-sm border-2 px-2 pt-1 pb-2 font-mono"
        style={{ backgroundColor: PAL.textBg, borderColor: PAL.textBorder }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-8 shrink-0 items-center gap-1">
          <span
            id={titleId}
            className="min-w-0 flex-1 truncate text-center text-sm font-bold sm:text-base"
            style={{ color: PAL.lightest }}
          >
            {title}
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-my-1.5 flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-sm text-lg font-bold active:opacity-60"
            style={{ color: PAL.white }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
