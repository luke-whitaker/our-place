"use client";

import { useEffect, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { ITEM_CATALOG } from "@/lib/items";
import { PAL } from "@/lib/game/constants";
import OverlayPanel from "@/components/OverlayPanel";
import OverlayActionButton from "@/components/OverlayActionButton";
import type { PocketItem } from "@/lib/types";
import type { WorldFixture } from "@/lib/game/types";

interface LeaveLetterPanelProps {
  fixture: WorldFixture;
  /** The island owner's display name — the fixture only carries their
   * username, which is fine for the API calls but not for the title or the
   * success message. */
  ownerDisplayName: string;
  onClose: () => void;
  /** Called once a letter is successfully left, so the caller can raise the
   * mailbox's flag on the world — mirrors MailboxPanel's own onMailChange,
   * always with `true` here since leaving one guarantees the mailbox is no
   * longer empty. */
  onMailChange: (hasMail: boolean) => void;
}

/** A row's preview: the first line only, matching MailboxPanel and
 * NotebookPanel's draft preview. */
function preview(body: string | null): string {
  const firstLine = (body ?? "").split("\n")[0].trim();
  if (!firstLine) return "(blank page)";
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
}

/**
 * <LeaveLetterPanel /> — a visitor's side of someone else's mailbox. Lists
 * the visitor's own mailable notes (never the owner's mail — visitors can
 * never see what's already inside) and lets them leave one. A separate
 * component from MailboxPanel rather than one panel switching modes: the two
 * have almost nothing in common beyond the OverlayPanel chrome.
 */
export default function LeaveLetterPanel({
  fixture,
  ownerDisplayName,
  onClose,
  onMailChange,
}: LeaveLetterPanelProps) {
  const [items, setItems] = useState<PocketItem[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [leavingId, setLeavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ items: PocketItem[] }>("/api/pockets")
      .then((data) => {
        if (!cancelled) setItems(data.items);
      })
      .catch((err) => {
        if (!cancelled) setError(userMessage(err, "Failed to load your pockets."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const notes = (items ?? []).filter((item) => ITEM_CATALOG[item.kind].mailable);
  const hasNotebook = (items ?? []).some((item) => item.kind === "notebook");

  async function leave(item: PocketItem) {
    setLeavingId(item.id);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/api/users/${encodeURIComponent(fixture.owner)}/mailbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id }),
      });
      setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
      setNotice(`You left a letter for ${ownerDisplayName}.`);
      onMailChange(true);
    } catch (err) {
      setError(userMessage(err, "Failed to leave that letter."));
    } finally {
      setLeavingId(null);
    }
  }

  return (
    <OverlayPanel title={`📬 ${ownerDisplayName}'s mailbox`} onClose={onClose}>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {notice && (
        <p className="text-sm" style={{ color: PAL.lightest }}>
          {notice}
        </p>
      )}
      {!items && !error && (
        <p className="text-sm" style={{ color: PAL.light }}>
          Loading...
        </p>
      )}
      {items && notes.length === 0 && (
        <p className="text-sm" style={{ color: PAL.light }}>
          {hasNotebook
            ? "Write a note in your Notebook, tear it out, and come back to leave it here."
            : "Gnomie in the Welcome Center can give you a Notebook to write letters with."}
        </p>
      )}
      {items && notes.length > 0 && (
        <div className="flex flex-col gap-1 overflow-y-auto">
          {notes.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-sm border px-2 py-1"
              style={{ borderColor: PAL.textBorder }}
            >
              <span className="min-w-0 flex-1 truncate text-sm" style={{ color: PAL.white }}>
                {preview(item.body)}
              </span>
              <div className="shrink-0">
                <OverlayActionButton onClick={() => leave(item)} disabled={leavingId === item.id}>
                  {leavingId === item.id ? "Leaving..." : "Leave it here"}
                </OverlayActionButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </OverlayPanel>
  );
}
