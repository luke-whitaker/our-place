"use client";

import { useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { PAL } from "@/lib/game/constants";
import { shortDate } from "@/lib/time-utils";
import InlineConfirm from "@/components/InlineConfirm";
import OverlayActionButton from "@/components/OverlayActionButton";
import type { PocketItem } from "@/lib/types";

interface NoteReaderProps {
  item: PocketItem;
  /** Where this note was opened from, so the reader knows both where Back
   * goes and whether to offer Take: a letter still sitting in the mailbox
   * can be taken into pockets from right here, but a note already in
   * pockets has nowhere left to take it. */
  returnTo: "pockets" | "mailbox";
  /** Back to Pockets or the mailbox — also where a successful throw-away or
   * take returns to, since both panels refetch fresh on every mount. */
  onBack: () => void;
}

/**
 * <NoteReader /> — reading a torn-out page or a mailbox letter. Paper-styled
 * (light background, dark text) rather than the HUD's dark chrome, so it
 * reads as the note itself rather than another terminal panel; the title bar
 * and action controls stay in the HUD palette so they're still clearly "the
 * world's UI" around the paper.
 */
export default function NoteReader({ item, returnTo, onBack }: NoteReaderProps) {
  const [confirming, setConfirming] = useState(false);
  const [taking, setTaking] = useState(false);
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

  async function take() {
    setTaking(true);
    setError("");
    try {
      await apiFetch(`/api/mailbox/${item.id}/take`, { method: "POST" });
      onBack();
    } catch (err) {
      setError(userMessage(err, "Failed to take that letter."));
      setTaking(false);
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
        aria-label={item.from ? `Letter from ${item.from.display_name}` : "Note"}
        className="flex max-h-full w-full max-w-2xl flex-col gap-2 overflow-y-auto rounded-sm border-2 p-2 font-mono"
        style={{ backgroundColor: PAL.textBg, borderColor: PAL.textBorder }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-sm font-bold" style={{ color: PAL.lightest }}>
          Note
        </p>
        {item.from && (
          <p className="text-center text-xs" style={{ color: PAL.light }}>
            From {item.from.display_name}
            {item.placed_at ? ` · ${shortDate(item.placed_at)}` : ""}
          </p>
        )}
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
          <div className="flex flex-wrap gap-2">
            {returnTo === "mailbox" && (
              <OverlayActionButton onClick={take} disabled={taking}>
                {taking ? "Taking..." : "Take"}
              </OverlayActionButton>
            )}
            <OverlayActionButton
              onClick={() => setConfirming(true)}
              variant="secondary"
              disabled={taking}
            >
              Throw away
            </OverlayActionButton>
            <OverlayActionButton
              onClick={onBack}
              variant={returnTo === "mailbox" ? "secondary" : "primary"}
              disabled={taking}
            >
              Back
            </OverlayActionButton>
          </div>
        )}
      </div>
    </div>
  );
}
