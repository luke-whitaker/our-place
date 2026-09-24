"use client";

import { PAL } from "@/lib/game/constants";
import type { ReactNode } from "react";

interface OverlayActionButtonProps {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  /** The primary action in a row reads brighter (PAL.white); a secondary one
   * (Back, No, Cancel) reads dimmer (PAL.light). Defaults to primary. */
  variant?: "primary" | "secondary";
}

/** A 44px action button in the HUD palette, shared by every world overlay
 * (Pockets, the Notebook, the note reader) so "Open notebook", "Save", "Tear
 * out", and "Back" all look like the same terminal. */
export default function OverlayActionButton({
  onClick,
  children,
  disabled = false,
  variant = "primary",
}: OverlayActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 flex-1 touch-manipulation rounded-sm border px-3 text-sm font-bold not-italic disabled:opacity-40 active:opacity-60"
      style={{ borderColor: PAL.textBorder, color: variant === "primary" ? PAL.white : PAL.light }}
    >
      {children}
    </button>
  );
}
