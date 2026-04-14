import { TILE, PAL } from "./constants";
import { Tile } from "./types";

/**
 * Procedurally generate all tile images as offscreen canvases.
 * Called once on mount — the returned map is cached and reused every frame.
 */
export function generateTileset(): Map<Tile, HTMLCanvasElement> {
  const tileset = new Map<Tile, HTMLCanvasElement>();

  function make(draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = TILE;
    c.height = TILE;
    const ctx = c.getContext("2d")!;
    draw(ctx);
    return c;
  }

  // ── Grass ──

  tileset.set(
    Tile.GRASS,
    make((ctx) => {
      ctx.fillStyle = PAL.grass1;
      ctx.fillRect(0, 0, TILE, TILE);
      // Subtle texture dots
      ctx.fillStyle = PAL.grass2;
      ctx.fillRect(3, 4, 1, 1);
      ctx.fillRect(10, 2, 1, 1);
      ctx.fillRect(7, 11, 1, 1);
      ctx.fillRect(13, 8, 1, 1);
    }),
  );

  tileset.set(
    Tile.GRASS2,
    make((ctx) => {
      ctx.fillStyle = PAL.grass2;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = PAL.grass1;
      ctx.fillRect(5, 3, 1, 1);
      ctx.fillRect(12, 7, 1, 1);
      ctx.fillRect(2, 12, 1, 1);
    }),
  );

  // ── Path ──

  tileset.set(
    Tile.PATH,
    make((ctx) => {
      ctx.fillStyle = PAL.path;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = PAL.pathEdge;
      ctx.fillRect(6, 3, 2, 1);
      ctx.fillRect(11, 10, 2, 1);
    }),
  );

  tileset.set(
    Tile.PATH_EDGE,
    make((ctx) => {
      ctx.fillStyle = PAL.pathEdge;
      ctx.fillRect(0, 0, TILE, TILE);
    }),
  );

  tileset.set(
    Tile.DIRT,
    make((ctx) => {
      ctx.fillStyle = PAL.dirt;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = PAL.pathEdge;
      ctx.fillRect(4, 6, 1, 1);
      ctx.fillRect(11, 3, 1, 1);
    }),
  );

  // ── Water ──

  tileset.set(
    Tile.WATER,
    make((ctx) => {
      ctx.fillStyle = PAL.water1;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = PAL.water2;
      ctx.fillRect(2, 4, 4, 1);
      ctx.fillRect(9, 9, 5, 1);
      ctx.fillStyle = PAL.waterLight;
      ctx.fillRect(3, 5, 2, 1);
      ctx.fillRect(10, 10, 3, 1);
    }),
  );

  tileset.set(
    Tile.WATER2,
    make((ctx) => {
      ctx.fillStyle = PAL.water1;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = PAL.water2;
      ctx.fillRect(5, 3, 5, 1);
      ctx.fillRect(1, 11, 4, 1);
      ctx.fillStyle = PAL.waterLight;
      ctx.fillRect(6, 4, 3, 1);
      ctx.fillRect(2, 12, 2, 1);
    }),
  );

  // ── Trees ──

  tileset.set(
    Tile.TREE_TOP,
    make((ctx) => {
      ctx.fillStyle = PAL.grass1;
      ctx.fillRect(0, 0, TILE, TILE);
      // Canopy
      ctx.fillStyle = PAL.treeTop1;
      ctx.fillRect(2, 2, 12, 10);
      ctx.fillStyle = PAL.treeTop2;
      ctx.fillRect(4, 3, 8, 7);
      ctx.fillStyle = PAL.treeTop1;
      ctx.fillRect(5, 4, 2, 2);
      ctx.fillRect(9, 5, 3, 2);
    }),
  );

  tileset.set(
    Tile.TREE_TRUNK,
    make((ctx) => {
      ctx.fillStyle = PAL.grass1;
      ctx.fillRect(0, 0, TILE, TILE);
      // Trunk
      ctx.fillStyle = PAL.treeTrunk;
      ctx.fillRect(6, 0, 4, 12);
      ctx.fillStyle = PAL.dirt;
      ctx.fillRect(7, 0, 2, 10);
      // Ground roots
      ctx.fillStyle = PAL.treeTrunk;
      ctx.fillRect(4, 12, 8, 2);
    }),
  );

  // ── Buildings ──

  tileset.set(
    Tile.WALL,
    make((ctx) => {
      ctx.fillStyle = PAL.wall;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = PAL.wallDark;
      ctx.fillRect(0, 0, TILE, 1);
      ctx.fillRect(0, 8, TILE, 1);
    }),
  );

  tileset.set(
    Tile.WALL_LEFT,
    make((ctx) => {
      ctx.fillStyle = PAL.wall;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = PAL.wallDark;
      ctx.fillRect(0, 0, 2, TILE);
    }),
  );

  tileset.set(
    Tile.WALL_RIGHT,
    make((ctx) => {
      ctx.fillStyle = PAL.wall;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = PAL.wallDark;
      ctx.fillRect(14, 0, 2, TILE);
    }),
  );

  tileset.set(
    Tile.ROOF,
    make((ctx) => {
      ctx.fillStyle = PAL.roof;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = PAL.roofDark;
      ctx.fillRect(0, 14, TILE, 2);
    }),
  );

  tileset.set(
    Tile.ROOF_LEFT,
    make((ctx) => {
      ctx.fillStyle = PAL.roof;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = PAL.roofDark;
      ctx.fillRect(0, 0, 2, TILE);
      ctx.fillRect(0, 14, TILE, 2);
    }),
  );

  tileset.set(
    Tile.ROOF_RIGHT,
    make((ctx) => {
      ctx.fillStyle = PAL.roof;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = PAL.roofDark;
      ctx.fillRect(14, 0, 2, TILE);
      ctx.fillRect(0, 14, TILE, 2);
    }),
  );

  tileset.set(
    Tile.DOOR,
    make((ctx) => {
      ctx.fillStyle = PAL.wall;
      ctx.fillRect(0, 0, TILE, TILE);
      // Door
      ctx.fillStyle = PAL.doorFrame;
      ctx.fillRect(3, 2, 10, 14);
      ctx.fillStyle = PAL.door;
      ctx.fillRect(4, 3, 8, 13);
      // Knob
      ctx.fillStyle = PAL.lightest;
      ctx.fillRect(10, 9, 1, 1);
    }),
  );

  tileset.set(
    Tile.WINDOW,
    make((ctx) => {
      ctx.fillStyle = PAL.wall;
      ctx.fillRect(0, 0, TILE, TILE);
      // Window frame
      ctx.fillStyle = PAL.windowFrame;
      ctx.fillRect(3, 3, 10, 10);
      // Glass
      ctx.fillStyle = PAL.window;
      ctx.fillRect(4, 4, 8, 8);
      // Crossbar
      ctx.fillStyle = PAL.windowFrame;
      ctx.fillRect(7, 4, 2, 8);
      ctx.fillRect(4, 7, 8, 2);
    }),
  );

  tileset.set(
    Tile.FENCE,
    make((ctx) => {
      ctx.fillStyle = PAL.grass1;
      ctx.fillRect(0, 0, TILE, TILE);
      // Posts
      ctx.fillStyle = PAL.fencePost;
      ctx.fillRect(1, 4, 2, 10);
      ctx.fillRect(13, 4, 2, 10);
      // Rails
      ctx.fillStyle = PAL.fence;
      ctx.fillRect(0, 6, TILE, 2);
      ctx.fillRect(0, 11, TILE, 2);
    }),
  );

  // ── Brick (pedestrian mall) ──

  tileset.set(
    Tile.BRICK,
    make((ctx) => {
      ctx.fillStyle = PAL.brick1;
      ctx.fillRect(0, 0, TILE, TILE);
      // Brick pattern
      ctx.fillStyle = PAL.brickGap;
      ctx.fillRect(0, 3, TILE, 1);
      ctx.fillRect(0, 7, TILE, 1);
      ctx.fillRect(0, 11, TILE, 1);
      ctx.fillRect(0, 15, TILE, 1);
      ctx.fillRect(7, 0, 1, 4);
      ctx.fillRect(3, 4, 1, 4);
      ctx.fillRect(11, 4, 1, 4);
      ctx.fillRect(7, 8, 1, 4);
      ctx.fillRect(3, 12, 1, 4);
      ctx.fillRect(11, 12, 1, 4);
      // Alternate brick color for variety
      ctx.fillStyle = PAL.brick2;
      ctx.fillRect(1, 0, 5, 3);
      ctx.fillRect(8, 4, 3, 3);
      ctx.fillRect(1, 8, 5, 3);
      ctx.fillRect(8, 12, 3, 3);
    }),
  );

  // ── Bridge ──

  tileset.set(
    Tile.BRIDGE,
    make((ctx) => {
      ctx.fillStyle = PAL.bridgeDeck;
      ctx.fillRect(0, 0, TILE, TILE);
      // Plank lines
      ctx.fillStyle = PAL.brickGap;
      ctx.fillRect(0, 5, TILE, 1);
      ctx.fillRect(0, 11, TILE, 1);
    }),
  );

  tileset.set(
    Tile.BRIDGE_RAIL,
    make((ctx) => {
      ctx.fillStyle = PAL.bridgeDeck;
      ctx.fillRect(0, 0, TILE, TILE);
      // Rail
      ctx.fillStyle = PAL.bridgeRail;
      ctx.fillRect(0, 0, TILE, 3);
      // Posts
      ctx.fillStyle = PAL.bridgeRailPost;
      ctx.fillRect(2, 0, 2, 5);
      ctx.fillRect(12, 0, 2, 5);
    }),
  );

  // ── House door (player's "My Place") ──

  tileset.set(
    Tile.HOUSE_DOOR,
    make((ctx) => {
      ctx.fillStyle = PAL.wall;
      ctx.fillRect(0, 0, TILE, TILE);
      // Door
      ctx.fillStyle = PAL.doorFrame;
      ctx.fillRect(3, 2, 10, 14);
      ctx.fillStyle = PAL.shirt; // Blue door for the player's house
      ctx.fillRect(4, 3, 8, 13);
      // Knob
      ctx.fillStyle = PAL.lightest;
      ctx.fillRect(10, 9, 1, 1);
    }),
  );

  return tileset;
}
