"use client";

import { useEffect, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { DESK_PAGE_SLOTS, DESK_SLOTS, ITEM_CATALOG, POCKET_SLOTS } from "@/lib/items";
import { PAL } from "@/lib/game/constants";
import OverlayPanel from "@/components/OverlayPanel";
import InlineConfirm from "@/components/InlineConfirm";
import OverlayActionButton from "@/components/OverlayActionButton";
import ItemSlotGrid, { slotCells } from "@/components/ItemSlotGrid";
import type { DeskContents, PocketItem } from "@/lib/types";

const PAGE_COUNT = DESK_SLOTS / DESK_PAGE_SLOTS;

interface DeskPanelProps {
  /** The page to open on: 0 normally, or the page a note was read from. */
  initialPage: number;
  onClose: () => void;
  /** Read a note where it sits; the reader comes back to this page. */
  onReadNote: (item: PocketItem, page: number) => void;
}

/** Both sides of the desk screen, loaded together and updated together, so
 * an item moved between them can never show up in both or neither. */
interface Contents {
  desk: PocketItem[];
  pockets: PocketItem[];
}

/** The first empty slot on `page`, so a put-away lands where you're looking;
 * undefined when the page is full, and the server picks the first free slot. */
function freeSlotOnPage(desk: readonly PocketItem[], page: number): number | undefined {
  const first = page * DESK_PAGE_SLOTS;
  const cells = slotCells(desk, first, DESK_PAGE_SLOTS);
  const index = cells.indexOf(null);
  return index === -1 ? undefined : first + index;
}

/**
 * <DeskPanel /> — the owner's desk: 100 slots shown 10 to a page, with their
 * pockets underneath. Select a desk item to read, take, or throw it away;
 * select a pocket item to put it in the desk. Only the owner ever sees this
 * (WorldOverlays shows a visitor the locked line), and the routes behind it
 * only ever touch the caller's own items.
 */
export default function DeskPanel({ initialPage, onClose, onReadNote }: DeskPanelProps) {
  const [contents, setContents] = useState<Contents | null>(null);
  const [page, setPage] = useState(initialPage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<DeskContents>("/api/desk"),
      apiFetch<{ items: PocketItem[] }>("/api/pockets"),
    ])
      .then(([desk, pockets]) => {
        if (!cancelled) setContents({ desk: desk.items, pockets: pockets.items });
      })
      .catch((err) => {
        if (!cancelled) setError(userMessage(err, "Failed to open your desk."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const inDesk = contents?.desk.find((i) => i.id === selectedId) ?? null;
  const inPockets = contents?.pockets.find((i) => i.id === selectedId) ?? null;
  const selected = inDesk ?? inPockets;

  function select(item: PocketItem) {
    setSelectedId(item.id);
    setConfirmingDiscard(false);
    setError("");
  }

  function turnPage(delta: number) {
    setPage((p) => Math.min(PAGE_COUNT - 1, Math.max(0, p + delta)));
    setSelectedId(null);
    setConfirmingDiscard(false);
  }

  /** Run one desk action; `apply` updates both lists from its result. */
  async function act(run: () => Promise<(c: Contents) => Contents>, fallback: string) {
    setBusy(true);
    setError("");
    try {
      const apply = await run();
      setContents((c) => (c ? apply(c) : c));
      setSelectedId(null);
    } catch (err) {
      setError(userMessage(err, fallback));
    } finally {
      setConfirmingDiscard(false);
      setBusy(false);
    }
  }

  function putAway(item: PocketItem) {
    const slot = contents ? freeSlotOnPage(contents.desk, page) : undefined;
    void act(async () => {
      const res = await apiFetch<{ item: PocketItem }>("/api/desk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id, slot }),
      });
      return (c) => ({
        desk: [...c.desk, res.item],
        pockets: c.pockets.filter((i) => i.id !== item.id),
      });
    }, "Failed to put that away.");
  }

  function take(item: PocketItem) {
    void act(async () => {
      const res = await apiFetch<{ item: PocketItem }>(`/api/desk/${item.id}/take`, {
        method: "POST",
      });
      return (c) => ({
        desk: c.desk.filter((i) => i.id !== item.id),
        pockets: [...c.pockets, res.item],
      });
    }, "Failed to take that out.");
  }

  function discard(item: PocketItem) {
    void act(async () => {
      await apiFetch(`/api/pockets/${item.id}`, { method: "DELETE" });
      return (c) => ({ ...c, desk: c.desk.filter((i) => i.id !== item.id) });
    }, "Failed to throw that away.");
  }

  return (
    <OverlayPanel title="Desk" onClose={onClose}>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!contents && !error && (
        <p className="text-sm" style={{ color: PAL.light }}>
          Loading...
        </p>
      )}
      {contents && (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous page"
              onClick={() => turnPage(-1)}
              disabled={page === 0}
              className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-sm border font-bold disabled:opacity-30"
              style={{ borderColor: PAL.textBorder, color: PAL.white }}
            >
              ◀
            </button>
            <p className="flex-1 text-center text-sm" style={{ color: PAL.lightest }}>
              Page {page + 1} of {PAGE_COUNT}
              <span style={{ color: PAL.light }}>
                {" "}
                · {contents.desk.length} of {DESK_SLOTS} kept
              </span>
            </p>
            <button
              type="button"
              aria-label="Next page"
              onClick={() => turnPage(1)}
              disabled={page === PAGE_COUNT - 1}
              className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-sm border font-bold disabled:opacity-30"
              style={{ borderColor: PAL.textBorder, color: PAL.white }}
            >
              ▶
            </button>
          </div>
          <ItemSlotGrid
            cells={slotCells(contents.desk, page * DESK_PAGE_SLOTS, DESK_PAGE_SLOTS)}
            selectedId={selectedId}
            onSelect={select}
            emptyLabel="Empty spot"
          />
          <p className="text-sm" style={{ color: PAL.light }}>
            Your pockets
          </p>
          <ItemSlotGrid
            cells={slotCells(contents.pockets, 0, POCKET_SLOTS)}
            selectedId={selectedId}
            onSelect={select}
            emptyLabel="Empty pocket"
          />
        </>
      )}
      {selected && (
        <div className="flex flex-col gap-2 border-t pt-2" style={{ borderColor: PAL.textBorder }}>
          <p className="text-sm font-bold" style={{ color: PAL.white }}>
            {describe(selected)}
          </p>
          {inDesk && confirmingDiscard ? (
            <InlineConfirm
              message="Throw this away? It's gone for good."
              onConfirm={() => discard(inDesk)}
              onCancel={() => setConfirmingDiscard(false)}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {inDesk?.kind === "note" && (
                <OverlayActionButton onClick={() => onReadNote(inDesk, page)} disabled={busy}>
                  Read
                </OverlayActionButton>
              )}
              {inDesk && (
                <OverlayActionButton onClick={() => take(inDesk)} disabled={busy}>
                  Take
                </OverlayActionButton>
              )}
              {inDesk && ITEM_CATALOG[inDesk.kind].discardable && (
                <OverlayActionButton
                  onClick={() => setConfirmingDiscard(true)}
                  variant="secondary"
                  disabled={busy}
                >
                  Throw away
                </OverlayActionButton>
              )}
              {inPockets && (
                <OverlayActionButton onClick={() => putAway(inPockets)} disabled={busy}>
                  Put in desk
                </OverlayActionButton>
              )}
            </div>
          )}
        </div>
      )}
    </OverlayPanel>
  );
}

/** "Note from Sam" for a letter, else the item's catalog name. */
function describe(item: PocketItem): string {
  if (item.kind === "note" && item.from) return `Note from ${item.from.display_name}`;
  return ITEM_CATALOG[item.kind].name;
}
