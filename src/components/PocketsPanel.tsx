"use client";

import { useEffect, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { ITEM_CATALOG, POCKET_SLOTS } from "@/lib/items";
import { PAL } from "@/lib/game/constants";
import OverlayPanel from "@/components/OverlayPanel";
import InlineConfirm from "@/components/InlineConfirm";
import OverlayActionButton from "@/components/OverlayActionButton";
import type { PocketItem } from "@/lib/types";

interface PocketsPanelProps {
  onClose: () => void;
  onOpenNotebook: () => void;
  onReadNote: (item: PocketItem) => void;
}

/**
 * <PocketsPanel /> — the 5x2 grid of a member's 10 pocket slots. Loads on
 * open; selecting a filled slot shows that item's actions (opening the
 * Notebook, reading or discarding a Note). The Notebook and note reader are
 * separate screens WorldOverlays swaps to — this panel only asks for them.
 */
export default function PocketsPanel({ onClose, onOpenNotebook, onReadNote }: PocketsPanelProps) {
  const [items, setItems] = useState<PocketItem[] | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

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

  const selected = items?.find((i) => i.id === selectedId) ?? null;

  async function discardSelected() {
    if (!selected) return;
    try {
      await apiFetch(`/api/pockets/${selected.id}`, { method: "DELETE" });
      setItems((prev) => (prev ?? []).filter((i) => i.id !== selected.id));
      setSelectedId(null);
    } catch (err) {
      setError(userMessage(err, "Failed to throw that away."));
    } finally {
      setConfirmingDiscard(false);
    }
  }

  return (
    <OverlayPanel title="👖 Pockets" onClose={onClose}>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!items && !error && (
        <p className="text-sm" style={{ color: PAL.light }}>
          Loading...
        </p>
      )}
      {items && (
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: POCKET_SLOTS }, (_, slot) => {
            const item = items.find((i) => i.slot === slot) ?? null;
            const catalog = item ? ITEM_CATALOG[item.kind] : null;
            const isSelected = item?.id === selectedId;
            return (
              <button
                key={slot}
                type="button"
                disabled={!item}
                onClick={() => {
                  setSelectedId(item?.id ?? null);
                  setConfirmingDiscard(false);
                }}
                aria-label={catalog?.name ?? "Empty pocket"}
                title={catalog?.name}
                className="flex min-h-11 items-center justify-center rounded-sm border p-1"
                style={{
                  borderColor: item ? PAL.textBorder : "rgba(238,228,218,0.2)",
                  backgroundColor: isSelected ? "rgba(238,228,218,0.12)" : "transparent",
                }}
              >
                {catalog && (
                  // eslint-disable-next-line @next/next/no-img-element -- a tiny world-art icon, not a Next-optimized asset
                  <img
                    src={catalog.icon}
                    alt=""
                    width={32}
                    height={32}
                    style={{ imageRendering: "pixelated" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
      {selected && (
        <div className="flex flex-col gap-2 border-t pt-2" style={{ borderColor: PAL.textBorder }}>
          <p className="text-sm font-bold" style={{ color: PAL.white }}>
            {ITEM_CATALOG[selected.kind].name}
          </p>
          {confirmingDiscard ? (
            <InlineConfirm
              message="Throw this note away? It's gone for good."
              onConfirm={discardSelected}
              onCancel={() => setConfirmingDiscard(false)}
            />
          ) : (
            <div className="flex gap-2">
              {selected.kind === "notebook" && (
                <OverlayActionButton onClick={onOpenNotebook}>Open notebook</OverlayActionButton>
              )}
              {selected.kind === "note" && (
                <OverlayActionButton onClick={() => onReadNote(selected)}>Read</OverlayActionButton>
              )}
              {ITEM_CATALOG[selected.kind].discardable && (
                <OverlayActionButton onClick={() => setConfirmingDiscard(true)} variant="secondary">
                  Throw away
                </OverlayActionButton>
              )}
            </div>
          )}
        </div>
      )}
    </OverlayPanel>
  );
}
