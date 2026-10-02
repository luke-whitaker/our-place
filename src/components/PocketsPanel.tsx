"use client";

import { useEffect, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { ITEM_CATALOG, POCKET_SLOTS } from "@/lib/items";
import { PAL } from "@/lib/game/constants";
import OverlayPanel from "@/components/OverlayPanel";
import ItemSlotGrid, { slotCells } from "@/components/ItemSlotGrid";
import InlineConfirm from "@/components/InlineConfirm";
import OverlayActionButton from "@/components/OverlayActionButton";
import { WORLD_TIME_ZONE } from "@/lib/time-utils";
import type { PlantSpot } from "@/components/WorldOverlays";
import type { PocketItem } from "@/lib/types";

interface PocketsPanelProps {
  onClose: () => void;
  onOpenNotebook: () => void;
  onReadNote: (item: PocketItem) => void;
  /** Where an Event Mushroom would be planted from here, if anywhere. */
  plant: PlantSpot | null;
  onPlant: (item: PocketItem, spot: PlantSpot) => void;
}

/** Why an Event Mushroom can't be planted from where the player stands, or
 * null when Plant here should show. */
function plantBlocker(item: PocketItem, spot: PlantSpot | null): string | null {
  const info = item.mushroom;
  if (!info || !spot) return "This gathering isn't on anymore.";
  if (Date.parse(info.starts_at) <= spot.now) return "This gathering has started.";
  if (!info.worlds.includes(spot.worldId)) {
    return "Plant it in the shared world, on your own island, or inside your community's building.";
  }
  return spot.problem;
}

/**
 * <PocketsPanel /> — the 5x2 grid of a member's 10 pocket slots. Loads on
 * open; selecting a filled slot shows that item's actions (opening the
 * Notebook, reading or discarding a Note). The Notebook and note reader are
 * separate screens WorldOverlays swaps to — this panel only asks for them.
 */
export default function PocketsPanel({
  onClose,
  onOpenNotebook,
  onReadNote,
  plant,
  onPlant,
}: PocketsPanelProps) {
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
        <ItemSlotGrid
          cells={slotCells(items, 0, POCKET_SLOTS)}
          selectedId={selectedId}
          onSelect={(item) => {
            setSelectedId(item.id);
            setConfirmingDiscard(false);
          }}
          emptyLabel="Empty pocket"
        />
      )}
      {selected && (
        <div className="flex flex-col gap-2 border-t pt-2" style={{ borderColor: PAL.textBorder }}>
          <p className="text-sm font-bold" style={{ color: PAL.white }}>
            {selected.kind === "note" && selected.from
              ? `Note from ${selected.from.display_name}`
              : ITEM_CATALOG[selected.kind].name}
          </p>
          {selected.kind === "event_mushroom" && (
            <MushroomDetails item={selected} plant={plant} onPlant={onPlant} />
          )}
          {confirmingDiscard ? (
            <InlineConfirm
              message={`Throw this ${selected.kind === "note" ? "note" : "mushroom"} away? It's gone for good.`}
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
              {(ITEM_CATALOG[selected.kind].discardable ||
                (selected.kind === "event_mushroom" && !selected.mushroom)) && (
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

/** An Event Mushroom's gathering, and Plant here when the spot in front of
 * the player will take it; otherwise the reason it won't. */
function MushroomDetails({
  item,
  plant,
  onPlant,
}: {
  item: PocketItem;
  plant: PlantSpot | null;
  onPlant: (item: PocketItem, spot: PlantSpot) => void;
}) {
  const blocker = plantBlocker(item, plant);
  return (
    <>
      {item.mushroom && (
        <p className="text-xs" style={{ color: PAL.light }}>
          {item.mushroom.title}, starts {startsAt(item.mushroom.starts_at)}
        </p>
      )}
      {blocker || !plant ? (
        <p className="text-xs" style={{ color: PAL.light }}>
          {blocker}
        </p>
      ) : (
        <div className="flex gap-2">
          <OverlayActionButton onClick={() => onPlant(item, plant)}>Plant here</OverlayActionButton>
        </div>
      )}
    </>
  );
}

/** "Sat, Oct 3, 7:00 PM CDT": the world's clock, like the letters. */
function startsAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: WORLD_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
