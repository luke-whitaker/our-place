"use client";

import { useEffect, useRef, useState } from "react";
import { EMOTES, type Emote } from "@/lib/types";
import { bubbleArt, drawEmoteBubble, EMOTE_SCALE } from "@/lib/game/emote-art";

/** Keyboard shortcut shown beside each emote: its position, 1 to 6. */
const SHORTCUT = (i: number) => String(i + 1);

/** One emote's bubble, painted from the same pixel art the world draws. */
function EmoteIcon({ emote, scale = EMOTE_SCALE }: { emote: Emote; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const art = bubbleArt(emote);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, art.w * EMOTE_SCALE, art.h * EMOTE_SCALE);
    // Fully shown: past the pop-in, never fading.
    drawEmoteBubble(ctx, emote, (art.w * EMOTE_SCALE) / 2, art.h * EMOTE_SCALE, 1000, Infinity);
  }, [emote, art.w, art.h]);
  return (
    <canvas
      ref={ref}
      width={art.w * EMOTE_SCALE}
      height={art.h * EMOTE_SCALE}
      // `scale` CSS px per art pixel; the canvas itself is drawn at EMOTE_SCALE.
      style={{ width: art.w * scale, height: art.h * scale, imageRendering: "pixelated" }}
      aria-hidden="true"
    />
  );
}

/**
 * The emote button, under full screen in the world's top-right corner, and the
 * small picker it opens as a column below it: on a short landscape screen, two
 * rows of three to the left of the button instead, above the touch controls (z-30) so the A button never
 * covers it. The three corner buttons sit within one
 * thumb's reach on a phone (Luke's call). On a
 * keyboard, 1 to 6 do the same without opening it. The world page hides this
 * while a menu or overlay is open, which also closes the picker.
 */
export default function EmotePicker({ onPick }: { onPick: (emote: Emote) => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // Hand focus back to the world so the next Enter reaches it.
          e.currentTarget.blur();
          setOpen((o) => !o);
        }}
        aria-label="Emotes"
        aria-expanded={open}
        title="Emotes (1 to 6)"
        className="absolute right-2 top-15 z-[5] flex h-11 w-11 touch-manipulation select-none items-center justify-center rounded-full border border-white/25 bg-surface/10 hover:bg-surface/20 active:bg-surface/25"
      >
        <EmoteIcon emote="laugh" scale={1} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Choose an emote"
          className="absolute right-2 top-28 z-40 flex max-h-[calc(100%-8rem)] flex-col gap-1 overflow-y-auto rounded-xl [@media(max-height:500px)]:right-15 [@media(max-height:500px)]:top-15 [@media(max-height:500px)]:grid [@media(max-height:500px)]:max-h-none [@media(max-height:500px)]:grid-cols-3 border border-white/25 bg-surface-inverse/90 p-1.5 shadow-lg"
        >
          {EMOTES.map((emote, i) => (
            <button
              key={emote}
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.currentTarget.blur();
                setOpen(false);
                onPick(emote);
              }}
              aria-label={`${emote} emote`}
              title={`${emote} (${SHORTCUT(i)})`}
              className="flex h-12 w-12 touch-manipulation select-none items-center justify-center rounded-lg hover:bg-white/10 active:bg-white/20"
            >
              <EmoteIcon emote={emote} scale={1.5} />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
