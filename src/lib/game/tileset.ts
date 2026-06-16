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
      ctx.fillRect(4, 6, 10, 2);
      ctx.fillRect(18, 16, 11, 2);
      ctx.fillRect(2, 24, 9, 2);
      ctx.fillStyle = PAL.waterLight;
      ctx.fillRect(6, 7, 5, 1);
      ctx.fillRect(20, 17, 6, 1);
      ctx.fillRect(4, 25, 4, 1);
    }),
  );

  tileset.set(
    Tile.WATER2,
    make((ctx) => {
      ctx.fillStyle = PAL.water1;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = PAL.water2;
      ctx.fillRect(10, 10, 11, 2);
      ctx.fillRect(2, 20, 10, 2);
      ctx.fillRect(20, 4, 9, 2);
      ctx.fillStyle = PAL.waterLight;
      ctx.fillRect(12, 11, 6, 1);
      ctx.fillRect(4, 21, 4, 1);
      ctx.fillRect(22, 5, 5, 1);
    }),
  );

  // ── Trees ──

  tileset.set(
    Tile.TREE_TOP,
    make((ctx) => {
      ctx.fillStyle = PAL.grass1;
      ctx.fillRect(0, 0, TILE, TILE);
      // Canopy — a rounded blob filling most of the tile
      ctx.fillStyle = PAL.treeTop1;
      ctx.fillRect(3, 3, 26, 25);
      ctx.fillStyle = PAL.grass1; // round the corners back to grass
      ctx.fillRect(3, 3, 5, 5);
      ctx.fillRect(24, 3, 5, 5);
      ctx.fillRect(3, 23, 5, 5);
      ctx.fillRect(24, 23, 5, 5);
      // Inner shadow
      ctx.fillStyle = PAL.treeTop2;
      ctx.fillRect(8, 8, 16, 15);
      // Leaf highlights
      ctx.fillStyle = PAL.treeTop1;
      ctx.fillRect(10, 9, 6, 4);
      ctx.fillRect(18, 13, 6, 5);
      ctx.fillRect(9, 17, 5, 4);
    }),
  );

  tileset.set(
    Tile.TREE_TRUNK,
    make((ctx) => {
      ctx.fillStyle = PAL.grass1;
      ctx.fillRect(0, 0, TILE, TILE);
      // Canopy overhang from the TREE_TOP tile above (so a 2-tile tree reads as one)
      ctx.fillStyle = PAL.treeTop1;
      ctx.fillRect(5, 0, 22, 7);
      ctx.fillStyle = PAL.treeTop2;
      ctx.fillRect(8, 0, 16, 4);
      // Trunk
      ctx.fillStyle = PAL.treeTrunk;
      ctx.fillRect(12, 6, 8, 18);
      ctx.fillStyle = PAL.dirt;
      ctx.fillRect(14, 7, 3, 16);
      // Ground roots
      ctx.fillStyle = PAL.treeTrunk;
      ctx.fillRect(9, 23, 14, 3);
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

  // ── Frontier tiles (placeholder sprites — to refine in Aseprite) ──

  tileset.set(
    Tile.TALL_GRASS,
    make((ctx) => {
      ctx.fillStyle = PAL.grass1;
      ctx.fillRect(0, 0, TILE, TILE);
      // Vertical blades
      ctx.fillStyle = PAL.tallGrass1;
      ctx.fillRect(3, 9, 1, 6);
      ctx.fillRect(7, 7, 1, 8);
      ctx.fillRect(11, 10, 1, 5);
      ctx.fillRect(14, 8, 1, 6);
      // Shorter blades
      ctx.fillStyle = PAL.tallGrass2;
      ctx.fillRect(5, 12, 1, 3);
      ctx.fillRect(9, 11, 1, 4);
      ctx.fillRect(13, 13, 1, 2);
    }),
  );

  const drawFlower = (ctx: CanvasRenderingContext2D, petalColor: string) => {
    ctx.fillStyle = PAL.grass1;
    ctx.fillRect(0, 0, TILE, TILE);
    // Stem
    ctx.fillStyle = PAL.flowerStem;
    ctx.fillRect(7, 8, 1, 5);
    // Petals (cross shape)
    ctx.fillStyle = petalColor;
    ctx.fillRect(6, 5, 3, 3);
    ctx.fillRect(7, 4, 1, 1);
    ctx.fillRect(7, 8, 1, 1);
    ctx.fillRect(5, 6, 1, 1);
    ctx.fillRect(9, 6, 1, 1);
    // Center
    ctx.fillStyle = PAL.flowerYellow;
    ctx.fillRect(7, 6, 1, 1);
  };

  tileset.set(
    Tile.FLOWER_RED,
    make((ctx) => drawFlower(ctx, PAL.flowerRed)),
  );
  tileset.set(
    Tile.FLOWER_YELLOW,
    make((ctx) => drawFlower(ctx, PAL.flowerYellow)),
  );
  tileset.set(
    Tile.FLOWER_PURPLE,
    make((ctx) => drawFlower(ctx, PAL.flowerPurple)),
  );

  tileset.set(
    Tile.SAND,
    make((ctx) => {
      ctx.fillStyle = PAL.sand1;
      ctx.fillRect(0, 0, TILE, TILE);
      // Scattered grains
      ctx.fillStyle = PAL.sand2;
      ctx.fillRect(4, 5, 1, 1);
      ctx.fillRect(11, 3, 1, 1);
      ctx.fillRect(7, 9, 1, 1);
      ctx.fillRect(13, 11, 1, 1);
      ctx.fillRect(2, 12, 1, 1);
      ctx.fillRect(9, 13, 1, 1);
    }),
  );

  tileset.set(
    Tile.MOUNTAIN,
    make((ctx) => {
      ctx.fillStyle = PAL.mountain1;
      ctx.fillRect(0, 0, TILE, TILE);
      // Darker patches (rocky texture)
      ctx.fillStyle = PAL.mountain2;
      ctx.fillRect(0, 10, TILE, 6);
      ctx.fillRect(10, 0, 6, 10);
      // Deep shadow
      ctx.fillStyle = PAL.mountainShadow;
      ctx.fillRect(14, 14, 2, 2);
      ctx.fillRect(0, 15, TILE, 1);
      ctx.fillRect(15, 0, 1, TILE);
      // Highlight
      ctx.fillStyle = PAL.light;
      ctx.fillRect(2, 2, 3, 1);
      ctx.fillRect(3, 3, 1, 1);
    }),
  );

  tileset.set(
    Tile.MUSHROOM,
    make((ctx) => {
      ctx.fillStyle = PAL.grass1;
      ctx.fillRect(0, 0, TILE, TILE);
      // Stem
      ctx.fillStyle = PAL.mushroomStem;
      ctx.fillRect(12, 16, 8, 13);
      ctx.fillStyle = PAL.sand2;
      ctx.fillRect(12, 16, 2, 13);
      // Cap (big red dome)
      ctx.fillStyle = PAL.mushroomCap;
      ctx.fillRect(4, 9, 24, 8);
      ctx.fillRect(8, 6, 16, 3);
      ctx.fillRect(12, 4, 8, 2);
      // Cap underside
      ctx.fillStyle = PAL.brick1;
      ctx.fillRect(4, 16, 24, 2);
      // White spots
      ctx.fillStyle = PAL.mushroomSpot;
      ctx.fillRect(9, 10, 3, 3);
      ctx.fillRect(18, 8, 3, 3);
      ctx.fillRect(22, 12, 2, 2);
      ctx.fillRect(14, 13, 2, 2);
    }),
  );

  tileset.set(
    Tile.STONE_RUIN,
    make((ctx) => {
      ctx.fillStyle = PAL.grass1;
      ctx.fillRect(0, 0, TILE, TILE);
      // Stone block
      ctx.fillStyle = PAL.ruinStone;
      ctx.fillRect(1, 3, 14, 11);
      // Shadow on bottom
      ctx.fillStyle = PAL.ruinStoneDark;
      ctx.fillRect(1, 12, 14, 2);
      // Mortar lines (cracks)
      ctx.fillRect(1, 7, 14, 1);
      ctx.fillRect(7, 3, 1, 4);
      ctx.fillRect(8, 8, 1, 6);
      // Moss accents
      ctx.fillStyle = PAL.ruinMoss;
      ctx.fillRect(2, 6, 2, 1);
      ctx.fillRect(11, 9, 2, 1);
      ctx.fillRect(4, 13, 1, 1);
    }),
  );

  return tileset;
}
