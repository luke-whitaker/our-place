"use client";

import { ITEM_CATALOG, itemIcon, itemName } from "@/lib/items";
import { PAL } from "@/lib/game/constants";
import { worldAsset } from "@/lib/game/asset-url";
import type { PocketItem } from "@/lib/types";

interface ItemSlotGridProps {
  /** One entry per cell, in order: the item there, or null for an empty one. */
  cells: ReadonlyArray<PocketItem | null>;
  selectedId: string | null;
  onSelect: (item: PocketItem) => void;
  /** Read aloud for an empty cell ("Empty pocket", "Empty drawer"). */
  emptyLabel: string;
}

/** The cells for slots `first` .. `first + count - 1`: each slot's item, or
 * null where that slot is empty. */
export function slotCells(
  items: readonly PocketItem[],
  first: number,
  count: number,
): (PocketItem | null)[] {
  const bySlot = new Map(items.map((item) => [item.slot, item]));
  return Array.from({ length: count }, (_, i) => bySlot.get(first + i) ?? null);
}

/** `items` with `item` in it: replacing the row with the same id, since a
 * stack that merged into one already shown comes back under that one's id. */
export function upsertItem(items: readonly PocketItem[], item: PocketItem): PocketItem[] {
  return [...items.filter((i) => i.id !== item.id), item];
}

/** `items` after one of item `id` is gone: a stack shrinks by one, a single
 * item leaves the list. */
export function dropOne(items: readonly PocketItem[], id: string): PocketItem[] {
  return items.flatMap((i) =>
    i.id !== id ? [i] : i.quantity > 1 ? [{ ...i, quantity: i.quantity - 1 }] : [],
  );
}

/** The count drawn on a stack's icon: pixel digits in the bottom-right
 * corner, with a dark outline so they read on any icon. */
function StackCount({ quantity }: { quantity: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-0.5 bottom-0 font-mono text-xs leading-none font-bold"
      style={{
        color: PAL.white,
        textShadow:
          "1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000, 1px 1px 0 #000, -1px -1px 0 #000",
      }}
    >
      {quantity}
    </span>
  );
}

/**
 * <ItemSlotGrid /> — a 5-wide grid of item slots with 44px tap targets, shared
 * by Pockets (10 slots) and a page of the desk (10 of its 100). Empty cells
 * are disabled; tapping a filled one selects it.
 */
export default function ItemSlotGrid({
  cells,
  selectedId,
  onSelect,
  emptyLabel,
}: ItemSlotGridProps) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {cells.map((item, i) => {
        const catalog = item ? ITEM_CATALOG[item.kind] : null;
        return (
          <button
            key={item?.id ?? `empty-${i}`}
            type="button"
            disabled={!item}
            onClick={() => item && onSelect(item)}
            aria-label={item ? itemName(item) : emptyLabel}
            title={item ? itemName(item) : undefined}
            className="relative flex min-h-11 items-center justify-center rounded-sm border p-1"
            style={{
              borderColor: item ? PAL.textBorder : "rgba(238,228,218,0.2)",
              backgroundColor:
                item && item.id === selectedId ? "rgba(238,228,218,0.12)" : "transparent",
            }}
          >
            {catalog && item && (
              // eslint-disable-next-line @next/next/no-img-element -- a tiny world-art icon, not a Next-optimized asset
              <img
                src={worldAsset(itemIcon(item))}
                crossOrigin="anonymous"
                alt=""
                width={32}
                height={32}
                style={{ imageRendering: "pixelated" }}
              />
            )}
            {item && item.quantity > 1 && <StackCount quantity={item.quantity} />}
          </button>
        );
      })}
    </div>
  );
}
