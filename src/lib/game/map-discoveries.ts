// The world client's copy of the member's map discoveries, and when to save
// it. Walking marks chunks locally every frame (cheap: nothing happens unless
// a new chunk clears) and saves are batched: at most one every SAVE_DELAY_MS
// while exploring, plus one right away for a new shrine and one on leaving.
// Saves send the whole bitmap; the server ORs it in, so a repeat or an
// out-of-order save never loses anything.

import {
  decodeVisited,
  emptyVisited,
  encodeVisited,
  markAround,
  orVisited,
  type ChunkGrid,
} from "./map-chunks";
import type { WorldDiscoveries } from "@/lib/types";

/** How long to gather newly cleared chunks before saving them. */
export const SAVE_DELAY_MS = 4000;

export interface SaveBody {
  world: string;
  visited?: string;
  shrines?: string[];
}

export interface DiscoverySyncOptions {
  worldId: string;
  grid: ChunkGrid;
  /** Sends one save. `keepalive` is set for the save made while the page is
   * going away, so the browser finishes it after the page is gone. */
  send: (body: SaveBody, keepalive: boolean) => Promise<WorldDiscoveries>;
  /** Called once per run of failed saves, so the page can say so. */
  onSaveError: () => void;
  saveDelayMs?: number;
}

export class DiscoverySync {
  readonly grid: ChunkGrid;
  visited: Uint8Array;
  readonly shrines = new Set<string>();
  /** Bumped on every change, so a drawer redraws only when there's news. */
  version = 0;
  private readonly options: DiscoverySyncOptions;
  private visitedUnsent = false;
  private readonly shrinesUnsent = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failing = false;
  private lastTile = "";

  constructor(options: DiscoverySyncOptions) {
    this.options = options;
    this.grid = options.grid;
    this.visited = emptyVisited(options.grid);
  }

  /** Mark the chunks around the player. Called every frame; it only does work
   * when the player reaches a new tile, and only saves when a chunk clears. */
  notePosition(col: number, row: number): void {
    const tile = `${Math.round(col)},${Math.round(row)}`;
    if (tile === this.lastTile) return;
    this.lastTile = tile;
    this.reveal(col, row);
  }

  /** Clear the chunks around a spot, saved with the next batch. Also used for
   * shrines found before the map existed: you were there, so it's explored. */
  reveal(col: number, row: number): void {
    if (!markAround(this.grid, this.visited, col, row)) return;
    this.version++;
    this.visitedUnsent = true;
    this.schedule();
  }

  /** A shrine just found: saved straight away. */
  noteShrine(shrineId: string): void {
    if (this.shrines.has(shrineId)) return;
    this.shrines.add(shrineId);
    this.version++;
    this.shrinesUnsent.add(shrineId);
    void this.flush(false);
  }

  /** Fold in what the account already has (the server's answer). */
  merge(server: WorldDiscoveries): void {
    const visited = decodeVisited(server.visited, this.grid);
    if (visited) this.visited = orVisited(this.visited, visited);
    for (const id of server.shrines) this.shrines.add(id);
    this.version++;
  }

  /** Save anything not yet saved. Never more than one timer; a failed save
   * marks its contents unsent again, so the next change or flush retries. */
  async flush(keepalive: boolean): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.visitedUnsent && this.shrinesUnsent.size === 0) return;
    const body: SaveBody = { world: this.options.worldId };
    if (this.visitedUnsent) body.visited = encodeVisited(this.visited);
    if (this.shrinesUnsent.size > 0) body.shrines = [...this.shrinesUnsent];
    const sentShrines = body.shrines ?? [];
    this.visitedUnsent = false;
    this.shrinesUnsent.clear();
    try {
      this.merge(await this.options.send(body, keepalive));
      this.failing = false;
    } catch {
      if (body.visited) this.visitedUnsent = true;
      for (const id of sentShrines) this.shrinesUnsent.add(id);
      if (!this.failing) this.options.onSaveError();
      this.failing = true;
    }
  }

  /** Stop the timer and send what's left, for leaving the page or the world. */
  dispose(): void {
    void this.flush(true);
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush(false);
    }, this.options.saveDelayMs ?? SAVE_DELAY_MS);
  }
}
