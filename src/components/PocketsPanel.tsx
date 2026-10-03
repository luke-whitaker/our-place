"use client";

import { useEffect, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { ITEM_CATALOG, POCKET_SLOTS, itemIcon, itemName } from "@/lib/items";
import { worldAsset } from "@/lib/game/asset-url";
import { PAL } from "@/lib/game/constants";
import OverlayPanel from "@/components/OverlayPanel";
import ItemSlotGrid, { slotCells } from "@/components/ItemSlotGrid";
import InlineConfirm from "@/components/InlineConfirm";
import OverlayActionButton from "@/components/OverlayActionButton";
import { WORLD_TIME_ZONE } from "@/lib/time-utils";
import type { PlantSpot } from "@/components/WorldOverlays";
import type { PocketItem, WornHat } from "@/lib/types";

interface PocketsPanelProps {
  onClose: () => void;
  onOpenNotebook: () => void;
  onReadNote: (item: PocketItem) => void;
  /** Where an Event Mushroom would be planted from here, if anywhere. */
  plant: PlantSpot | null;
  onPlant: (item: PocketItem, spot: PlantSpot) => void;
  /** Plant a seed or place a flower on the tile in front of the player. */
  onGarden: (item: PocketItem, spot: PlantSpot) => void;
  /** After a flower is worn or taken off, so the world draws it. */
  onHatChange: () => void;
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
  onGarden,
  onHatChange,
}: PocketsPanelProps) {
  const [items, setItems] = useState<PocketItem[] | null>(null);
  const [hat, setHat] = useState<PocketItem | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiFetch<{ items: PocketItem[] }>("/api/pockets"), apiFetch<WornHat>("/api/hat")])
      .then(([data, worn]) => {
        if (cancelled) return;
        setItems(data.items);
        setHat(worn.hat);
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

  /** Reload pockets and hat after wearing or taking off, since a swap moves
   * two items at once. */
  async function reload() {
    const [data, worn] = await Promise.all([
      apiFetch<{ items: PocketItem[] }>("/api/pockets"),
      apiFetch<WornHat>("/api/hat"),
    ]);
    setItems(data.items);
    setHat(worn.hat);
  }

  async function wear(item: PocketItem) {
    try {
      await apiFetch("/api/hat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id }),
      });
      setSelectedId(null);
      await reload();
      onHatChange();
    } catch (err) {
      setError(userMessage(err, "Couldn't put that on."));
    }
  }

  async function takeOff() {
    try {
      await apiFetch("/api/hat", { method: "DELETE" });
      await reload();
      onHatChange();
    } catch (err) {
      setError(userMessage(err, "Couldn't take that off."));
    }
  }

  return (
    <OverlayPanel title="👖 Pockets" onClose={onClose}>
      {hat && (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- a tiny world-art icon, not a Next-optimized asset */}
          <img
            src={worldAsset(itemIcon(hat))}
            crossOrigin="anonymous"
            alt=""
            width={24}
            height={24}
            style={{ imageRendering: "pixelated" }}
          />
          <p className="flex-1 text-sm" style={{ color: PAL.light }}>
            On your head: {itemName(hat).toLowerCase()}
          </p>
          <OverlayActionButton onClick={() => void takeOff()} variant="secondary">
            Take off
          </OverlayActionButton>
        </div>
      )}
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
              : itemName(selected)}
          </p>
          {selected.kind === "event_mushroom" && (
            <MushroomDetails item={selected} plant={plant} onPlant={onPlant} />
          )}
          {(selected.kind === "seed" || selected.kind === "flower") && (
            <GardenActions
              item={selected}
              plant={plant}
              onGarden={onGarden}
              onWear={(item) => void wear(item)}
            />
          )}
          {confirmingDiscard ? (
            <InlineConfirm
              message={`Throw this ${itemName(selected).toLowerCase()} away? It's gone for good.`}
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

/** A seed's Plant here, or a flower's Place here and Wear, with the reason
 * the tile in front of the player won't take it when it won't. */
function GardenActions({
  item,
  plant,
  onGarden,
  onWear,
}: {
  item: PocketItem;
  plant: PlantSpot | null;
  onGarden: (item: PocketItem, spot: PlantSpot) => void;
  onWear: (item: PocketItem) => void;
}) {
  const blocker = plant ? plant.garden : "Stand somewhere in the world first.";
  return (
    <>
      {item.kind === "seed" && (
        <p className="text-xs" style={{ color: PAL.light }}>
          It blooms 12 to 24 hours after you plant it.
        </p>
      )}
      {blocker && (
        <p className="text-xs" style={{ color: PAL.light }}>
          {blocker}
        </p>
      )}
      <div className="flex gap-2">
        {plant && !blocker && (
          <OverlayActionButton onClick={() => onGarden(item, plant)}>
            {item.kind === "seed" ? "Plant here" : "Place here"}
          </OverlayActionButton>
        )}
        {item.kind === "flower" && (
          <OverlayActionButton onClick={() => onWear(item)}>Wear</OverlayActionButton>
        )}
      </div>
    </>
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
