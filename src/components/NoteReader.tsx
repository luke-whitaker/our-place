"use client";

import { useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { PAL } from "@/lib/game/constants";
import InlineConfirm from "@/components/InlineConfirm";
import OverlayActionButton from "@/components/OverlayActionButton";
import type { PocketItem } from "@/lib/types";

interface NoteReaderProps {
  item: PocketItem;
  /** Back to Pockets — also where a successful throw-away returns to, since
   * Pockets refetches fresh on every mount. */
  onBack: () => void;
}

/**
 * <NoteReader /> — reading a torn-out page. Paper-styled (light background,
 * dark text) rather than the HUD's dark chrome, so it reads as the note
 * itself rather than another terminal panel; the title bar and Back/Throw
 * away controls stay in the HUD palette so they're still clearly "the world's
 * UI" around the paper.
 */
export default function NoteReader({ item, onBack }: NoteReaderProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  async function discard() {
    try {
      await apiFetch(`/api/pockets/${item.id}`, { method: "DELETE" });
      onBack();
    } catch (err) {
      setError(userMessage(err, "Failed to throw that away."));
      setConfirming(false);
    }
  }

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 px-2 py-1"
      onClick={onBack}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Note"
        className="flex max-h-full w-full max-w-2xl flex-col gap-2 overflow-y-auto rounded-sm border-2 p-2 font-mono"
        style={{ backgroundColor: PAL.textBg, borderColor: PAL.textBorder }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-sm font-bold" style={{ color: PAL.lightest }}>
          Note
        </p>
        <div
          className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-sm p-3 text-sm"
          style={{ backgroundColor: PAL.white, color: PAL.darkest }}
        >
          {item.body || "(blank page)"}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {confirming ? (
          <InlineConfirm
            message="Throw this note away? It's gone for good."
            onConfirm={discard}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <div className="flex gap-2">
            <OverlayActionButton onClick={() => setConfirming(true)} variant="secondary">
              Throw away
            </OverlayActionButton>
            <OverlayActionButton onClick={onBack}>Back</OverlayActionButton>
          </div>
        )}
      </div>
    </div>
  );
}
