# World Art Pipeline — Aseprite Asset Guide

This folder is where the hand-drawn pixel art for the 8-bit world lives. Drop your
exported PNGs here (and your `.aseprite` sources alongside them if you like) and the
game will load them in place of the current placeholder art — which is drawn as
colored rectangles in code (`src/lib/game/tileset.ts`, `src/lib/game/sprites.ts`).

> Drawing is the only manual step. Once the PNGs land here, wiring them into the game
> is a single code change + commit — no other pieces needed from you.

## Format rules (read first)

- **PNG, not JPG.** JPG is lossy (it smears pixel edges) and has no transparency.
  Keep editable `.aseprite` sources too; the game only needs the exported PNGs.
- **32×32 px per tile, drawn at 1× zoom.** Don't scale up in Aseprite — the game
  upscales for you. Player frames are also 32×32.
- **Transparency:**
  - **Tiles → full, opaque 32×32.** Each tile includes its own ground (e.g. a tree
    tile paints grass under the leaves). The renderer draws exactly one tile per cell
    with no layering.
  - **Player frames → transparent background** (they're drawn on top of tiles).
- **One consistent palette** across every tile. Use the existing 32-color fantasy
  palette (`PAL` in `src/lib/game/constants.ts`) or your own — consistency is what
  makes a tileset read as a single world.
- **Stay inside the 32×32 single-cell model for this first pass.** No objects that
  overhang into neighboring tiles. Taller/overlapping art (Stardew-style multi-tile
  trees) needs engine layering work — a deliberate later step.

## Delivery — pick either, both are one commit

- **(a) Individual PNGs** — one file per tile, named from the checklist below
  (e.g. `00-grass.png`, `05-tree-top.png`). Most forgiving; nothing to align.
- **(b) Aseprite sprite sheets** — `tileset.png` + `player.png`, each exported via
  **File → Export Sprite Sheet** with **"JSON Data" checked** (the `.json` is the
  frame map). Fewer files; matches the existing `scripts/generate-tiles.lua` pipeline.

## Tile checklist (30 tiles)

`(solid)` = blocks the player; everything else is walkable.

### Ground
- `00-grass` — base ground; the most common tile, must tile seamlessly with itself.
- `01-grass2` — grass variant/tuft accent; must blend with grass.
- `02-path` — dirt/stone walkway.
- `16-path-edge` — soft transition strip between path and grass.
- `17-dirt` — bare dirt patch (e.g. a doorstep).
- `18-brick` — brick/paver for pedestrian areas.
- `26-sand` — beach/desert sand.

### Water `(solid)` — 2-frame animation
- `03-water` — frame A.
- `04-water2` — frame B. The renderer swaps `03 ↔ 04` every ~0.5s; draw them as two
  slightly different ripple states so the loop reads as motion.

### Trees `(solid)` — two stacked tiles make one tree
- `05-tree-top` — canopy (full opaque tile, grass beneath the leaves).
- `06-tree-trunk` — trunk; sits in the cell directly below the canopy.

### Buildings — edge pieces that MUST align seamlessly
A community building is 4 wide × 3 tall:
```
ROOF_LEFT  ROOF    ROOF    ROOF_RIGHT
WALL_LEFT  WINDOW  WINDOW  WALL_RIGHT
WALL_LEFT  WALL    DOOR    WALL_RIGHT
```
- `08-roof`, `12-roof-left`, `13-roof-right` — roof middle + corners.
- `07-wall` `(solid)`, `14-wall-left` `(solid)`, `15-wall-right` `(solid)` — wall middle + side edges.
- `11-window` `(solid)` — building window.
- `10-door` — community entrance (you walk up and press Enter to enter).
- `21-house-door` — the player's "My Place" door (kept distinct — currently blue).
- `09-fence` `(solid)`.

### Bridge
- `19-bridge` — plank deck.
- `20-bridge-rail` — deck with a railing edge (used for BOTH the top and bottom rows
  of a bridge, so keep it readable from both sides).

### Frontier / nature
- `22-tall-grass` — taller grass blades.
- `23-flower-red`, `24-flower-yellow`, `25-flower-purple` — a flower on a grass base.
- `27-mountain` `(solid)` — rock/cliff face.
- `28-mushroom` `(solid)` — **hero asset:** the giant red-and-white warp shrine; a
  focal point of the world. Make it pop.
- `29-stone-ruin` `(solid)` — ancient ruined stone block.

## Player (8 frames, 32×32, transparent background)

Four directions × two walk frames:

- `player-down-0`, `player-down-1`
- `player-up-0`, `player-up-1`
- `player-left-0`, `player-left-1`
- `player-right-0`, `player-right-1`

Frame 0 = neutral/standing, frame 1 = mid-stride (the engine alternates them while
walking). Draw the character ~28px tall, centered, feet near the bottom of the cell.

### ⚠️ One decision before you draw the player — avatar customization
Today the player is **generated from each user's avatar** (hair style, skin, shirt,
pants, shoes colors). A single fixed hand-drawn character would **lose that
per-user customization** unless we plan for it:

- **(i) Fixed character** — simplest; drop avatar colors for now (revisit later).
- **(ii) Layered/recolorable** — draw body, hair, and clothes as separate transparent
  layers that the engine tints per avatar. Preserves customization; ~3–4× the frames.
- **(iii) Palette-swap** — draw with an indexed palette; the engine swaps colors.

Tiles can proceed regardless — just flag which way you want to go before starting the
player, and the loader will be built to match.
