---
paths:
  - "src/lib/game/**"
  - "src/components/WorldCanvas.tsx"
  - "src/components/IsoLab.tsx"
  - "src/components/AvatarPreview.tsx"
  - "src/app/world/**"
  - "src/app/iso-lab/**"
  - "src/app/avatar-builder/**"
  - "assets/world/**"
  - "scripts/upload-world-art.ts"
---

# The world: isometric engine and direction

## Direction (decided September 2, 2026)

The world stays isometric. Luke likes the art and is fine buying more from PixelHoo (the Evergrow artist) or another pack when a biome or interior needs it. The world is no longer "navigation only": it hosts content too (per-member islands, and later user-placed sprites).

Build order, each step visible to members:

1. Viewport culling. Done September 2, 2026.
2. More space to explore: outskirts around the Capital using owned art. Done September 3, 2026.
3. Floating My Place islands. Done September 3, 2026: `worlds/island.ts` generates a member's island from their user id (seeded PRNG, nothing stored but `users.biome` and `users.island_visibility`). From the Capital the only way home is the mycelium network's Home link (later also PCs); never a town building. The Portal on the profile lands at the island doorstep; arriving by the network lands at the island shrine. The island is a pocket you leave from; the Capital stays the daily loop.
4. Wilderness with tinted biomes and user-placed content sprites (geocaching for posts: the anti-feed).
5. Ports v2 interiors with PCs. Done September 4, 2026: nine building rooms plus a generated house on every island, each with a PC. The interior art was drawn for Our Place; the Evergrow pack has none.
6. Multiplayer presence, last. The seams are already in; name tags above avatars are the first visible piece.

Step 4, the wilderness, is the one still open; it now follows step 5 rather than preceding it.

**Terrain tint** (`terrain-tint.ts`): one HSL pass per image at load turns the forest sheets into autumn, snow, dusk, swamp, and scorched. Pixel color cannot tell a tree from a wall, because Evergrow paints foliage and building shadows in the same cool teal-greens, so every `OBJECT_CATALOG` entry names its `tint` target (`nature`, `evergreen`, `building`, or `ground`) and a world carries an optional `tint` preset. `world-assets.ts` bakes both at load for the world page and the lab (`/iso-lab?world=island&tint=snow`).

## Architecture

`/world` runs `WorldCanvas` over the engine in `src/lib/game/`:

- `world-model.ts`: the `IsoWorld` document (id, optional tint and ground sheet, terrain grid, placed objects, doors, PCs, mushrooms, links, regions), `OBJECT_CATALOG` (sprite, footprint, scale, solid, tint target), Zod validation, and a source-agnostic loader. Terrain `void` is never drawn and never walkable: an island's edge is the autotiler's dirt skirt against the dark.
- `iso.ts` 2:1 projection (TILE_W 32, TILE_H 16); `forest-autotile.ts` and `water-autotile.ts` 4-edge blob autotilers; `world-object.ts` bottom-centre-anchored sprites; `character-sheet.ts` 8-direction animator; `avatar-recolor.ts` per-part palette swap to the member's avatar colors; `world-assets.ts` loads and tints everything a world needs.
- `iso-collision.ts` pure collision; `iso-actor.ts` `computeIntent` then `applyMovement`; `iso-engine.ts` `createIsoState`, `update`, `render`, and the camera; `hud.ts` prompt, toast, name tag, and warp-menu chrome; `iso-save.ts` per-device localStorage save, one slot per world id; `prng.ts` seeded randomness for generated places.
- `worlds/capital.ts` is the authored town: one building and one Ports door per community slug. `worlds/island.ts` generates a member's island. `worlds/interior.ts` generates a room from a short spec, `worlds/interiors.ts` holds the nine community rooms and the PC network, `worlds/island-house.ts` the generated per-member house. `worlds/lab-town.ts` is the sandbox for `/iso-lab`.
- `viewport.ts` sizes the canvas: `fitCanvas` fills the screen on touch devices and letterboxes 3:2 up to 960x640 on desktop, and `computeViewport` picks an integer device-px-per-world-px `worldScale` so pixel art stays crisp at any DPR. `render` draws the world layer at that scale and the HUD in CSS px (`ctx.setTransform(dpr, …)`), so HUD font sizes are real CSS sizes. The canvas is `box-content`: its CSS size is the drawing surface, and the border comes out of the container's space.
- A world may name its own `groundSheet`; absent means the forest sheet. The interior sheet is painted in the same cell layout, so the autotiler needs no change and `grass`/`dirt` read as floorboards/flags. Walls are objects on the room's own edge tiles: `world-object.ts` pins a sprite's lowest base pixel to its tile centre, so a wall one tile out floats half a tile clear of the floor.
- Links (`IsoWorld.links`) are warp-menu rows that leave the world; they never need discovering. The engine fires `onWorldLink` at the peak of the fade and holds black until the page navigates.

Rules that keep the multiplayer and builder seams intact:

- Positions are world-space tile coordinates. Projection happens only at render.
- `update` never touches the canvas. `render` never mutates state.
- Collision stays a pure function over the world document, so a server could run it.
- The world is data. Adding art is a catalog entry, not an engine change. `capital.test.ts` validates the schema and flood-fills to assert every door and shrine is reachable from spawn. Keep it passing when you edit the town.

## Ports contract

Door ids are community slugs. `/world?at=<slug>` spawns at that building's door; `at` also accepts a shrine id or a PC id and lands one tile south of it. `/world?place=me` is the member's island and `/world?place=<username>` a visit (gated by `GET /api/users/[username]/island`). Portal buttons exist only on My Place and community pages.

Since Ports v2 a door with `warpTo` opens a world instead of porting to a page, and every real door has one: a building door warps to `<slug>-inside`, an island's cottage door to `me-inside` or `<username>-inside`.

**A door opens two ways: walk up into it, or press Enter.** The auto-warp test is on the _screen_ direction of the movement intent (`intent.sy < 0`), not the tile row delta. Doors sit on the north face of whatever they open and the camera looks at that face, but the tile axes run diagonally on screen, so "east along the street" is screen down-right and would read as northward on the row axis alone — which would make both town streets impassable, since every building door sits directly on one. Enter (the A button on touch) still works and is not gated on arming, because pressing it is already deliberate.

`state.doorArmed` is what stops a door bouncing you straight back: you always arrive inside the reach of the door you came through, so a state starts disarmed and only arms once no door is in reach. A player deep-linked to a doorstep by `?at=<slug>` therefore has to step off the threshold before walking in, or press Enter. That friction is the price of the loop being impossible; do not "fix" it by arming on key release, because a held key's auto-repeat can leave a tick with no input registered, which arms and then immediately fires. The round trip closes itself with no new spawn machinery — the exterior door arrives at the room's door named `exit`, and that door warps back arriving at the exterior door's id, because `spawnAt` resolves against the destination world's doors by id. A door without `warpTo` still ports to `/communities/<id>`; the field is optional so the fallback is live.

**PCs are the third interaction kind, beside doors and shrines.** A room's PC opens a menu whose first row logs on (a community page from its building, a profile from a house) and whose remaining rows are `world.links` — links are what any terminal here can reach, which is why an interior keeps its PC network in `links` and a shrine draws on the same list. A community room is as public as the building it sits in and needs no auth; a house follows its island's visit gate, with no second permission of its own. All three kinds confirm the same way: the prompt pill flashes green for 200ms (`CONFIRM_TICKS` in `iso-engine.ts`) before the door opens, the menu appears, or the walk-into fires. When more than one is in reach, `nearestTarget` keeps only the nearest, so the prompt, Enter, and walking into a door always agree; a tie goes to the door, so a door can always be walked into from its arrival tile. Enter and Space ignore keyboard auto-repeat (`input.ts`): a held Enter used to reach a menu the instant it opened after the confirm flash and pick its first row.

**Keyboard focus belongs to the world on arrival.** The game listens on `window`, so a key pressed while a link or button has focus goes to both. Clicking the navbar's 🍄 leaves focus on that link, and in-world navigations (`router.push`) never move it, so Enter at a PC flashed the prompt green and then followed the link to `/world`, dropping the player at their saved Capital spot. `WorldCanvas` now blurs whatever holds focus on every mount, and `input.ts` leaves Enter and Space alone when their target is a link, button, or field. Movement keys always reach the world. The canvas is `tabIndex={0}` so a keyboard user can Tab back into the world. It blurs rather than focusing the canvas, because a programmatic focus after a keyboard-driven door draws the browser's focus ring around the world on some arrivals and not others.

## Art and licensing

- Runtime art is gitignored under `public/world/{characters,tiles,objects}/`. Prod serves it from R2 via `NEXT_PUBLIC_WORLD_ASSET_BASE`. After adding art, run `npm run world:upload` before deploying, or prod 404s.
- Purchased packs (`assets/Evergrow_Forest_v0.5/` and the BossNelNel sheets) are never committed: their licenses forbid redistribution. See `CREDITS.md` and `assets/world/README.md`.
- Buildings are the six Evergrow Town_House sprites at 0.5 scale. Keep scales to powers of one half for crisp nearest-neighbour drawing.
- The pack has no interiors, computers, or seasonal variants, so the interior ground sheet, the wall runs, and the computer were drawn for Our Place (see `CREDITS.md`). Room furniture comes from the pack's Town_Assets set, which the town outside had not used.

## Verifying world work

Unit tests for the pure modules first. Then a Playwright screenshot of `/world` (log in as admin first) or `/iso-lab` (`?world=capital|island&tint=<preset>`). Interiors deep-link as `/world?place=<slug>-inside` and `/world?place=me-inside`, with `&at=pc` to land at the terminal. For renderer changes compare before and after; the pond animates on the frame counter, so allow a small tolerance confined to the water. Log in once and reuse the context's `storageState`: the login route allows 10 attempts per 15 minutes per IP, so a script that logs in for every scenario starts getting 429s and its navigation waits time out. Presses latch until the next tick (`input.endTick`), so `keyboard.press` and an instant `touchscreen.tap` work for Enter and the A button, but walking reads held keys: hold with `keyboard.down`, wait about 120 ms, then `keyboard.up`. Deep-link with `?at=<door or shrine id>` instead of walking; keyboard walking drifts in iso. For anything Enter or Space triggers, also run one pass the way a member arrives: load `/feed`, click the 🍄, and travel by doors and PCs from there. `page.goto` resets focus, so deep links alone hid the focused-link bug above through two rounds of testing.
