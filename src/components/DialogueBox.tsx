"use client";

import { useEffect } from "react";
import { worldAsset } from "@/lib/game/asset-url";
import { PAL } from "@/lib/game/constants";

interface DialogueBoxProps {
  /** The name over the line; null for a system line (a gift, a locked desk). */
  speaker: string | null;
  text: string;
  /** A world-art icon beside the line, like the item a gift line hands over. */
  icon?: string;
  italic?: boolean;
  /** Whether another line follows, shown as a down arrow. */
  hasMore: boolean;
  ariaLabel: string;
  /** Enter, Space, or a tap: the next line, or closing on the last. */
  onAdvance: () => void;
}

/**
 * <DialogueBox /> — the bottom-of-screen box every world line is spoken in:
 * NPC dialogue, and one-line notices like the locked desk. Owns only the look
 * and the advance keys; what's said, and what advancing does, is the caller's.
 */
export default function DialogueBox({
  speaker,
  text,
  icon,
  italic = false,
  hasMore,
  ariaLabel,
  onAdvance,
}: DialogueBoxProps) {
  // A plain window listener, like the rest of the world's input — re-attached
  // every render (no deps array) so it always calls the current onAdvance;
  // the listener itself is cheap enough that this costs nothing.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (e.code !== "Enter" && e.code !== "Space") return;
      e.preventDefault();
      onAdvance();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-2 pb-2 sm:pb-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={onAdvance}
        className="max-h-[75%] w-full max-w-2xl cursor-pointer overflow-y-auto rounded-sm border-2 px-4 py-3 font-mono"
        style={{ backgroundColor: PAL.textBg, borderColor: PAL.textBorder }}
      >
        {speaker && (
          <p className="mb-1 text-sm font-bold" style={{ color: PAL.lightest }}>
            {speaker}
          </p>
        )}
        <div className="flex items-start gap-3">
          {icon && (
            // eslint-disable-next-line @next/next/no-img-element -- a tiny world-art icon, not a Next-optimized asset
            <img
              src={worldAsset(icon)}
              crossOrigin="anonymous"
              alt=""
              width={32}
              height={32}
              style={{ imageRendering: "pixelated" }}
              className="shrink-0"
            />
          )}
          <p
            className={`flex-1 text-base leading-snug ${italic ? "italic" : ""}`}
            style={{ color: italic ? PAL.light : PAL.white }}
          >
            {text}
          </p>
        </div>
        {hasMore && (
          <p className="mt-1 text-right text-sm" style={{ color: PAL.light }} aria-hidden="true">
            ▼
          </p>
        )}
      </div>
    </div>
  );
}
