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
5. Ports v2 interiors with PCs, once interior art exists. The Evergrow pack has none.
6. Multiplayer presence, last. The seams are already in; name tags above avatars are the first visible piece.

**Terrain tint** (`terrain-tint.ts`): one HSL pass per image at load turns the forest sheets into autumn, snow, dusk, swamp, and scorched. Pixel color cannot tell a tree from a wall, because Evergrow paints foliage and building shadows in the same cool teal-greens, so every `OBJECT_CATALOG` entry names its `tint` target (`nature`, `evergreen`, `building`, or `ground`) and a world carries an optional `tint` preset. `world-assets.ts` bakes both at load for the world page and the lab (`/iso-lab?world=island&tint=snow`).

## Architecture

`/world` runs `WorldCanvas` over the engine in `src/lib/game/`:

- `world-model.ts`: the `IsoWorld` document (id, optional tint, terrain grid, placed objects, doors, mushrooms, links, regions), `OBJECT_CATALOG` (sprite, footprint, scale, solid, tint target), Zod validation, and a source-agnostic loader. Terrain `void` is never drawn and never walkable: an island's edge is the autotiler's dirt skirt against the dark.
- `iso.ts` 2:1 projection (TILE_W 32, TILE_H 16); `forest-autotile.ts` and `water-autotile.ts` 4-edge blob autotilers; `world-object.ts` bottom-centre-anchored sprites; `character-sheet.ts` 8-direction animator; `avatar-recolor.ts` per-part palette swap to the member's avatar colors; `world-assets.ts` loads and tints everything a world needs.
- `iso-collision.ts` pure collision; `iso-actor.ts` `computeIntent` then `applyMovement`; `iso-engine.ts` `createIsoState`, `update`, `render`, and the camera; `hud.ts` prompt, toast, name tag, and warp-menu chrome; `iso-save.ts` per-device localStorage save, one slot per world id; `prng.ts` seeded randomness for generated places.
- `worlds/capital.ts` is the authored town: one building and one Ports door per community slug. `worlds/island.ts` generates a member's island. `worlds/lab-town.ts` is the sandbox for `/iso-lab`.
- Links (`IsoWorld.links`) are warp-menu rows that leave the world; they never need discovering. The engine fires `onWorldLink` at the peak of the fade and holds black until the page navigates.

Rules that keep the multiplayer and builder seams intact:

- Positions are world-space tile coordinates. Projection happens only at render.
- `update` never touches the canvas. `render` never mutates state.
- Collision stays a pure function over the world document, so a server could run it.
- The world is data. Adding art is a catalog entry, not an engine change. `capital.test.ts` validates the schema and flood-fills to assert every door and shrine is reachable from spawn. Keep it passing when you edit the town.

## Ports contract

Door ids are community slugs. `/world?at=<slug>` spawns at that building's door; `at` also accepts a shrine id and lands one tile south of it. Walking into a door ports to `/communities/<slug>`. `/world?place=me` is the member's island and `/world?place=<username>` a visit (gated by `GET /api/users/[username]/island`); the island door (`my-place`) ports to `/profile` or the owner's `/profile/<username>`. Portal buttons exist only on My Place and community pages.

## Art and licensing

- Runtime art is gitignored under `public/world/{characters,tiles,objects}/`. Prod serves it from R2 via `NEXT_PUBLIC_WORLD_ASSET_BASE`. After adding art, run `npm run world:upload` before deploying, or prod 404s.
- Purchased packs (`assets/Evergrow_Forest_v0.5/` and the BossNelNel sheets) are never committed: their licenses forbid redistribution. See `CREDITS.md` and `assets/world/README.md`.
- Buildings are the six Evergrow Town_House sprites at 0.5 scale. Keep scales to powers of one half for crisp nearest-neighbour drawing.
- The pack has no interiors, furniture, computers, or seasonal variants. It has an unused Town_Assets set (fences, lamps, street objects).

## Verifying world work

Unit tests for the pure modules first. Then a Playwright screenshot of `/world` (log in as admin first) or `/iso-lab` (`?world=capital|island&tint=<preset>`). For renderer changes compare before and after; the pond animates on the frame counter, so allow a small tolerance confined to the water. Playwright's `keyboard.press` releases a key before a game tick can read it: hold with `keyboard.down`, wait about 120 ms, then `keyboard.up`. Deep-link with `?at=<door or shrine id>` instead of walking; keyboard walking drifts in iso.
