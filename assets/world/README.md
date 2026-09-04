# World Art Pipeline — Isometric Asset Guide

This folder is where the hand-drawn / licensed pixel art for the **isometric**
8-bit world lives. Drop exported PNGs here (and `.aseprite` sources alongside if
you like); the game loads runtime copies served out of git (see `CREDITS.md`).

> The world is **isometric 2:1** now (it used to be top-down — that pipeline is
> retired). Ground is a diamond autotile, structures and nature are free-standing
> objects that depth-sort against the player, and the character is an
> 8-direction sheet.

## The model in one minute

A place in the world is a plain data document — an `IsoWorld` in
`src/lib/game/world-model.ts`:

- **`terrain`** — a grid of ground kinds (`grass | dirt | path | water | sand`),
  rendered by the diamond autotiler.
- **`objects`** — a list of `{ kind, col, row }`. Each `kind` resolves through the
  **`OBJECT_CATALOG`** (also in `world-model.ts`) to a sprite, a collision
  **footprint** (the tiles it blocks), and a `solid` flag.
- **`doors`**, **`mushrooms`**, **`regions`** — Ports doors (id = community slug),
  warp shrines, and named regions for entry toasts.

Everything is in **world-space tile coordinates**; the iso projection happens only
at render. Adding art is wiring a PNG into the catalog — no engine changes.

## Format rules (read first)

- **PNG, not JPG.** JPG smears pixel edges and has no transparency.
- **Transparent background** on every object and character sprite — they're drawn
  on top of the ground and depth-sorted, so their margins must be clear.
- **Draw at 1× zoom.** The renderer upscales (`ISO_ZOOM`); don't pre-scale.
- Keep a **consistent palette** across a set so it reads as one world.

### Ground tiles — the Evergrow `Forest_Tiles` autotile

- **32×32 px cells**, each a **32×16 (2:1) diamond surface** over a 16 px dirt
  skirt. The sheet is a 4-edge "blob" autotiler: the engine picks a cell per tile
  from which of its four diamond-edge neighbours are grass (see
  `src/lib/game/forest-autotile.ts`). Keep grass regions roughly convex.
- Water + waterfalls (`Water_Tiles_*`) get the same treatment in a later pass —
  not wired yet; today non-grass terrain renders as bare ground.

### Objects — trees, rocks, buildings, the warp shrine

Free-standing sprites of any size, **anchored at the bottom-centre of their opaque
content** (auto-detected by an alpha scan in `src/lib/game/world-object.ts`) so they
rest on their tile and sort correctly with the player. To add one:

1. Drop the PNG at `public/world/objects/<name>.png` (served out of git).
2. Add a catalog entry in `OBJECT_CATALOG`: its `src`, a `footprint` (tile offsets
   it blocks, relative to its anchor tile), `solid`, and a `tint` target (`nature`,
   `evergreen`, `building`, or `ground`) that says how a biome recolors it.
3. Reference it as `{ kind: "<name>", col, row }` in a world.

The outskirts and the park use the pack's nature decorations (logs, stumps, rocks,
flower beds, grass tufts, the 80x128 trees) and `Town_Assets` (lamps, the well, crates,
flower boxes, a chair, two fence runs) at scale 1; see the catalog comments for each
source file. Community buildings use the 6 Evergrow `Town_House` sprites (catalog kinds
`cottage_blue`, `tower_green`, `house_purple`, `cottage_awning`, `manor_blue`,
`hall_red`), drawn at half size via the catalog's `scale` so each spans 5-7
tiles. Oversized art can set `scale` (keep to powers of ½ for crisp
nearest-neighbour); footprints should approximate the scaled base diamond.

### Character — the 8-direction sheet

The player is a BossNelNel 8-direction sheet (`long.png` ships first; see
`CREDITS.md`). Geometry lives in `src/lib/game/character-sheet.ts`: a 9×9 grid of
23×36 cells, column 0 idle + columns 1–8 walk, rows = the 8 facings clockwise from
South. A drop-in alternate (e.g. short hair) just needs the same geometry.

### Interiors — the wooden ground sheet, walls, and furniture

An interior is an ordinary `IsoWorld`. It needs no new terrain kind: a world can
name its own `groundSheet`, and `public/world/tiles/interior_wood.png` is painted
in the same cell layout `Forest_Tiles` uses, so `forest-autotile.ts` reads it
unchanged. `grass` becomes floorboards and `dirt` stone flags; both stay walkable,
so a room can mix two floor materials for free.

Walls are objects, not terrain — which the model already implies, since in iso
every structure is an object. There are two runs, because a 2:1 room has two
visible back faces: `wall_col` along the north row, `wall_row` down the west
column, `wall_corner` where they meet, plus `_window` and `_door` variants of
each run. The south and east sides are left open and closed off with `void`, the
standard iso cheat that keeps a room readable.

**Wall placement has one rule that is not adjustable from inside the art.**
`world-object.ts` anchors a sprite at the bottom-centre of its opaque content and
draws that on the tile centre, so a wall's lowest base pixel pins to the tile it
sits on. Put walls on the room's own edge tiles, never on the void outside them,
or the art floats half a tile clear of the floor.

Two more things worth knowing before furnishing a room:

- **Oversized props occlude.** Depth sorts by anchor tile, so `wardrobe` (64x80,
  two tiles) placed mid-room covers the wall behind it. Big pieces go against a
  wall.
- Don't hand-type a room. `src/lib/game/worlds/interior.ts` generates the floor,
  the walls, the doorway, and the computer from a short spec; see `interiors.ts`
  for the nine community rooms and `island-house.ts` for the generated per-member
  one.

A room is a **union of rectangles**, and the walls fall out of the resulting
outline: a floor tile takes a wall on whichever of its north and west sides is
not also floor. That gives L-shaped rooms and wings for free, but it constrains
the shape: **every face a notch creates must point north or west**, because the
south and east faces are the cutaway and nothing is drawn there. Cut the notch
from the room's north-west corner (a north wing flush to the east edge, or a
west wing flush to the south edge) and it renders correctly; cut it from the
north-east and you open an east face mid-room, which reads as a hole in the
building.

Interior partitions need no support: a run of `wall_col` or `wall_row` in
`props` is already solid and already depth-sorted.

## Authoring a town

Towns are composed in code as `IsoWorld` documents under
`src/lib/game/worlds/` (see `capital.ts` for the live town and its outskirts, and
`island.ts` for the generator behind every member's floating island). `WorldCanvas`
renders whatever world the `/world` page resolves from `?place=`, so a DB-loaded world
later is a page change, not an engine change. Author tests assert the schema is valid
and that every door + shrine is reachable on foot from spawn.
