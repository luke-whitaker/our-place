import { Tile } from "./types";
import type { Door, GameMap, MushroomWarp, NodeRegion, Region } from "./types";

/**
 * Shape of public/world/world.meta.json, emitted by scripts/generate-world.ts
 * alongside world.bin (row-major Uint8Array of tile bytes, cols × rows).
 */
export interface WorldMeta {
  cols: number;
  rows: number;
  spawnCol: number;
  spawnRow: number;
  seed: number;
  generatedAt: string;
  capital: { anchor: { col: number; row: number }; cols: number; rows: number };
  nodes: (NodeRegion & { reachableOnFoot: boolean })[];
  passages: {
    from: string;
    to: string;
    fromPoint: { col: number; row: number };
    toPoint: { col: number; row: number };
  }[];
  doors: Door[];
  mushrooms: MushroomWarp[];
}

export const CAPITAL_REGION_ID = "capital";

/**
 * Fetches the generated frontier world and assembles it into a GameMap.
 * The 500×500 grid is ~250KB over the wire; tiles are one byte each.
 */
export async function loadWorld(): Promise<{ map: GameMap; meta: WorldMeta }> {
  const [binRes, metaRes] = await Promise.all([
    fetch("/world/world.bin"),
    fetch("/world/world.meta.json"),
  ]);
  if (!binRes.ok || !metaRes.ok) {
    throw new Error("Failed to fetch world data.");
  }

  const meta = (await metaRes.json()) as WorldMeta;
  const bytes = new Uint8Array(await binRes.arrayBuffer());
  if (bytes.length !== meta.cols * meta.rows) {
    throw new Error(
      `World data mismatch: expected ${meta.cols * meta.rows} tiles, got ${bytes.length}.`,
    );
  }

  const tiles: Tile[][] = [];
  for (let r = 0; r < meta.rows; r++) {
    tiles.push(Array.from(bytes.subarray(r * meta.cols, (r + 1) * meta.cols)) as Tile[]);
  }

  const regions: Region[] = [
    {
      id: CAPITAL_REGION_ID,
      label: "The Capital",
      bounds: {
        col: meta.capital.anchor.col,
        row: meta.capital.anchor.row,
        w: meta.capital.cols,
        h: meta.capital.rows,
      },
    },
    ...meta.nodes.map((n) => ({ id: n.id, label: n.label, bounds: n.bounds })),
  ];

  const map: GameMap = {
    cols: meta.cols,
    rows: meta.rows,
    tiles,
    spawnCol: meta.spawnCol,
    spawnRow: meta.spawnRow,
    doors: meta.doors,
    mushrooms: meta.mushrooms,
    regions,
  };

  return { map, meta };
}
