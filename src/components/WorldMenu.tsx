"use client";

import { PAL } from "@/lib/game/constants";
import type { MenuEntry } from "@/lib/game/iso-engine";

interface WorldMenuProps {
  title: string;
  /** The menu's rows, in the same order and at the same indices the engine
   * uses — onPick hands a tapped tile's index straight to input.pick(). */
  entries: MenuEntry[];
  onPick: (index: number) => void;
  onClose: () => void;
}

const TITLE_ID = "world-menu-title";

/**
 * <WorldMenu /> — the touch replacement for the canvas-drawn PC and shrine
 * menus. Those draw fixed 24px rows sized for a keyboard or a joystick flick;
 * on a phone they're too small to tap, and held sideways the canvas menu can
 * clip its own title and Cancel row. This is a DOM overlay of large tappable
 * tiles instead, styled off the same palette as the canvas HUD so it still
 * reads as the same terminal. Desktop never mounts this — WorldCanvas keeps
 * the canvas-drawn menu there, unchanged.
 */
export default function WorldMenu({ title, entries, onPick, onClose }: WorldMenuProps) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 px-2 py-1"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        // Padding lives on the panel itself, not the header/grid separately, so
        // an iPhone held sideways gets every spare pixel toward the 44px tiles —
        // that's what keeps a 10-row menu (Log on + 9 destinations) on-screen
        // with no scrolling.
        className="flex max-h-full w-full max-w-2xl flex-col gap-0.5 overflow-y-auto rounded-sm border-2 px-1.5 pt-1 pb-0.5 font-mono"
        style={{ backgroundColor: PAL.textBg, borderColor: PAL.textBorder }}
        // Stop a tap inside the panel from bubbling to the backdrop and closing it.
        onClick={(e) => e.stopPropagation()}
      >
        {/* The header draws 32px tall while Close keeps a 44px tap target by
            hanging past it (negative margin): 12px more for the tiles, which is
            what lets a 320px-tall phone held sideways fit the whole menu. */}
        <div className="flex h-8 items-center gap-1">
          <span
            id={TITLE_ID}
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

        <div className="grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-1">
          {entries.map((entry, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(i)}
              className={`min-h-11 touch-manipulation rounded-sm border px-2 py-1.5 text-sm leading-tight active:opacity-60 ${
                entry.kind === "port" ? "col-span-full font-bold" : ""
              }`}
              style={{
                borderColor: PAL.textBorder,
                color: entry.kind === "port" ? PAL.white : PAL.light,
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
