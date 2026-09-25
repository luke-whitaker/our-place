"use client";

import { useEffect, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { MAILBOX_SLOTS } from "@/lib/items";
import { PAL } from "@/lib/game/constants";
import { shortDate } from "@/lib/time-utils";
import OverlayPanel from "@/components/OverlayPanel";
import InlineConfirm from "@/components/InlineConfirm";
import OverlayActionButton from "@/components/OverlayActionButton";
import type { PocketItem } from "@/lib/types";

interface MailboxPanelProps {
  onClose: () => void;
  onReadLetter: (item: PocketItem) => void;
  /** Called after the initial load and after every action (take, throw
   * away), so the caller (WorldOverlays) can keep the mailbox's flag on the
   * world in sync with what's actually inside it. */
  onMailChange: (hasMail: boolean) => void;
}

/** A row's preview: the first line only, so a multi-line letter still reads
 * as one line in the list — matches NotebookPanel's draft preview. */
function preview(body: string | null): string {
  const firstLine = (body ?? "").split("\n")[0].trim();
  if (!firstLine) return "(blank page)";
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
}

/**
 * <MailboxPanel /> — the owner's own side of their mailbox: every letter
 * waiting for them, newest first. Selecting one offers reading it in place,
 * taking it into pockets, or throwing it away. A separate component from
 * LeaveLetterPanel (the visitor's side) because the two share almost nothing:
 * different data source, different actions, different empty states — only
 * the OverlayPanel chrome is common.
 */
export default function MailboxPanel({ onClose, onReadLetter, onMailChange }: MailboxPanelProps) {
  const [letters, setLetters] = useState<PocketItem[] | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ letters: PocketItem[] }>("/api/mailbox")
      .then((data) => {
        if (cancelled) return;
        setLetters(data.letters);
        onMailChange(data.letters.length > 0);
      })
      .catch((err) => {
        if (!cancelled) setError(userMessage(err, "Failed to load your mailbox."));
      });
    return () => {
      cancelled = true;
    };
    // Only wanted once, on mount: WorldOverlays remounts this panel fresh
    // every time the mailbox screen reopens, which is exactly when the list
    // needs to be current, so nothing here needs to re-run on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = letters?.find((l) => l.id === selectedId) ?? null;

  /** Drop `id` from the local list and report the new flag state — shared by
   * take and discard, which both remove exactly one letter and never need a
   * refetch to know whether any are left. */
  function removeLetter(id: string) {
    const next = (letters ?? []).filter((l) => l.id !== id);
    setLetters(next);
    onMailChange(next.length > 0);
    setSelectedId(null);
  }

  async function discardSelected() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/api/pockets/${selected.id}`, { method: "DELETE" });
      removeLetter(selected.id);
    } catch (err) {
      setError(userMessage(err, "Failed to throw that away."));
    } finally {
      setConfirmingDiscard(false);
      setBusy(false);
    }
  }

  async function takeSelected() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/mailbox/${selected.id}/take`, { method: "POST" });
      removeLetter(selected.id);
    } catch (err) {
      setError(userMessage(err, "Failed to take that letter."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OverlayPanel title="📬 Mailbox" onClose={onClose}>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!letters && !error && (
        <p className="text-sm" style={{ color: PAL.light }}>
          Loading...
        </p>
      )}
      {letters && letters.length === 0 && (
        <p className="text-sm" style={{ color: PAL.light }}>
          Your mailbox is empty. When someone visits your island and leaves you a letter, the flag
          goes up.
        </p>
      )}
      {letters && letters.length > 0 && (
        <>
          <p className="text-sm" style={{ color: PAL.light }}>
            {letters.length} of {MAILBOX_SLOTS}
          </p>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {letters.map((letter) => (
              <button
                key={letter.id}
                type="button"
                onClick={() => {
                  setSelectedId(letter.id);
                  setConfirmingDiscard(false);
                }}
                className="flex min-h-11 touch-manipulation flex-col gap-0.5 rounded-sm border px-2 py-1 text-left text-sm"
                style={{
                  borderColor: PAL.textBorder,
                  backgroundColor:
                    letter.id === selectedId ? "rgba(238,228,218,0.12)" : "transparent",
                }}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-bold" style={{ color: PAL.white }}>
                    From {letter.from?.display_name ?? "someone"}
                  </span>
                  <span className="shrink-0 text-xs" style={{ color: PAL.light }}>
                    {letter.placed_at ? shortDate(letter.placed_at) : ""}
                  </span>
                </span>
                <span className="truncate" style={{ color: PAL.light }}>
                  {preview(letter.body)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {selected && (
        <div className="flex flex-col gap-2 border-t pt-2" style={{ borderColor: PAL.textBorder }}>
          {confirmingDiscard ? (
            <InlineConfirm
              message="Throw this letter away? It's gone for good."
              onConfirm={discardSelected}
              onCancel={() => setConfirmingDiscard(false)}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <OverlayActionButton onClick={() => onReadLetter(selected)} disabled={busy}>
                Read
              </OverlayActionButton>
              <OverlayActionButton onClick={takeSelected} disabled={busy}>
                Take
              </OverlayActionButton>
              <OverlayActionButton
                onClick={() => setConfirmingDiscard(true)}
                variant="secondary"
                disabled={busy}
              >
                Throw away
              </OverlayActionButton>
            </div>
          )}
        </div>
      )}
    </OverlayPanel>
  );
}
