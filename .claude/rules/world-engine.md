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

1. Viewport culling. Prerequisite for anything bigger than the Capital.
2. More space to explore: outskirts around the Capital using owned art.
3. Floating My Place islands: one house, a biome the member chooses (tint presets), and one mushroom shrine that ports to the Capital gate; the Capital's warp menu gains Home. Generated from a template plus stored choices, not a stored world. The island is a pocket you leave from; the Capital stays the daily loop.
4. Wilderness with tinted biomes and user-placed content sprites (geocaching for posts: the anti-feed).
5. Ports v2 interiors with PCs, once interior art exists. The Evergrow pack has none.
6. Multiplayer presence, last. The seams are already in.

**Terrain tint** (`terrain-tint.ts`, wired into `/iso-lab?world=capital&tint=autumn`): one HSL pass per image at load turns the forest sheets into autumn, snow, dusk, swamp, and scorched. Pixel color cannot tell a tree from a wall, because Evergrow paints foliage and building shadows in the same cool teal-greens, so tinting takes a target: `ground`, `nature`, `evergreen`, or `building`. Shipping it needs a `category` on `OBJECT_CATALOG` entries and a per-region sheet choice in `drawGround`.

## Architecture

`/world` runs `WorldCanvas` over the engine in `src/lib/game/`:

- `world-model.ts`: the `IsoWorld` document (terrain grid, placed objects, doors, mushrooms, regions), `OBJECT_CATALOG` (sprite, footprint, scale, solid), Zod validation, and a source-agnostic loader.
- `iso.ts` 2:1 projection (TILE_W 32, TILE_H 16); `forest-autotile.ts` and `water-autotile.ts` 4-edge blob autotilers; `world-object.ts` bottom-centre-anchored sprites; `character-sheet.ts` 8-direction animator; `avatar-recolor.ts` per-part palette swap to the member's avatar colors.
- `iso-collision.ts` pure collision; `iso-actor.ts` `computeIntent` then `applyMovement`; `iso-engine.ts` `createIsoState`, `update`, `render`, and the camera; `hud.ts` prompt, toast, and warp-menu chrome; `iso-save.ts` per-device localStorage save.
- `worlds/capital.ts` is the authored town: one building and one Ports door per community slug. `worlds/lab-town.ts` is the sandbox for `/iso-lab`.

Rules that keep the multiplayer and builder seams intact:

- Positions are world-space tile coordinates. Projection happens only at render.
- `update` never touches the canvas. `render` never mutates state.
- Collision stays a pure function over the world document, so a server could run it.
- The world is data. Adding art is a catalog entry, not an engine change. `capital.test.ts` validates the schema and flood-fills to assert every door and shrine is reachable from spawn. Keep it passing when you edit the town.

## Ports contract

Door ids are community slugs. `/world?at=<slug>` spawns at that building's door. Walking into a door ports to `/communities/<slug>`, or to `/profile` for `my-place`. Portal buttons exist only on My Place and community pages.

## Art and licensing

- Runtime art is gitignored under `public/world/{characters,tiles,objects}/`. Prod serves it from R2 via `NEXT_PUBLIC_WORLD_ASSET_BASE`. After adding art, run `npm run world:upload` before deploying, or prod 404s.
- Purchased packs (`assets/Evergrow_Forest_v0.5/` and the BossNelNel sheets) are never committed: their licenses forbid redistribution. See `CREDITS.md` and `assets/world/README.md`.
- Buildings are the six Evergrow Town_House sprites at 0.5 scale. Keep scales to powers of one half for crisp nearest-neighbour drawing.
- The pack has no interiors, furniture, computers, or seasonal variants. It has an unused Town_Assets set (fences, lamps, street objects).

## Verifying world work

Unit tests for the pure modules first. Then a Playwright screenshot of `/world` (log in as admin first) or `/iso-lab`. For renderer changes compare before and after; the pond animates on the frame counter, so allow a small tolerance confined to the water.
