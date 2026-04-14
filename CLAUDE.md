# Our Place — Project Instructions & Roadmap

## Project Overview

**Our Place** is a community forum/social platform (think Reddit-lite) built with:

- **Next.js 16** (App Router) + **TypeScript**
- **PostgreSQL** via **Prisma 7** ORM (schema in `prisma/schema.prisma`)
- **Tailwind CSS** for styling
- **JWT** auth with httpOnly cookies, bcrypt (12 rounds)
- **Zod** for validation, **Vitest** for unit tests, **Playwright** for UI tests

Core features already built: auth (register/login/verify/reset), communities, posts, comments, reactions, events, file uploads, user profiles, rich content editor, feed, "My Place" personal space.

---

## Coding Conventions

### Formatting

Prettier enforces all style rules. Run `npm run format` to auto-fix, `npm run format:check` to verify.

- 2-space indentation, no tabs
- Double quotes everywhere (Prettier-enforced)
- Semicolons always
- Trailing commas in multi-line objects/arrays
- 100-char print width

### Naming

| Context              | Convention                         | Example                             |
| -------------------- | ---------------------------------- | ----------------------------------- |
| React components     | PascalCase files + exports         | `PostCard.tsx`                      |
| Utility files        | kebab-case                         | `media-utils.ts`                    |
| API routes           | kebab-case dirs, always `route.ts` | `api/my-place/posts/route.ts`       |
| Variables, functions | camelCase                          | `loadCommunityFeed`                 |
| Constants            | UPPER_SNAKE_CASE                   | `JWT_SECRET`, `MAX_IMAGE_SIZE`      |
| Types, interfaces    | PascalCase                         | `User`, `PostType`                  |
| DB tables, columns   | snake_case                         | `community_members`, `avatar_color` |
| IDs                  | UUID (never auto-increment)        | `v4()` via `uuid` package           |

### Imports

Use `@/` path alias (maps to `src/`). Order:

1. Type imports (`import type { ... }`)
2. Next.js / React
3. External packages (zod, uuid, bcrypt, etc.)
4. `@/lib/*` utilities
5. `@/components/*`

### Types

Types are split by domain under `src/lib/types/`:

- `auth.ts` — User, UserPublic, AuthPayload, AVATAR_COLORS
- `forum.ts` — Community, Post, Comment, Event, and all forum-related types + COMMUNITY_CATEGORIES
- `index.ts` — barrel re-export (all existing `@/lib/types` imports work unchanged)

When adding game engine types, create `src/lib/types/game.ts` and add exports to `index.ts`.

### API Response Conventions

**Errors** (all routes): `{ error: "Human-readable message" }` with appropriate HTTP status code.

**Success — GET (lists/detail):** Return entity data directly, no message.

```
{ posts: [...] }
{ community: {...}, membership: {...}, members: [...] }
```

**Success — POST/mutations:** Return `{ message: "...", ...relevantData }`.

```
{ message: "Community created!", community: {...} }
{ message: "Reaction removed.", reacted: false }
```

### Testing

- **Unit tests**: Vitest — `npm run test` (or `npm run test:watch`)
- Test files live next to the module they test: `media-utils.test.ts` alongside `media-utils.ts`
- Test pure `lib/` functions first; DB-dependent code needs a test PostgreSQL instance
- **UI tests**: Playwright scripts in project root (`test-ui.mjs`)

### Commands

| Command                | Purpose                        |
| ---------------------- | ------------------------------ |
| `npm run dev`          | Dev server                     |
| `npm run build`        | Production build               |
| `npm run lint`         | ESLint                         |
| `npm run format`       | Prettier (auto-fix)            |
| `npm run format:check` | Prettier (CI check)            |
| `npm run test`         | Vitest (single run)            |
| `npm run test:watch`   | Vitest (watch mode)            |
| `npm run db:migrate`   | Run Prisma migrations          |
| `npm run db:push`      | Push schema without migration  |
| `npm run db:seed`      | Seed starter communities       |
| `npm run db:studio`    | Open Prisma Studio (DB viewer) |

---

## 8-Bit World UI — Vision & Roadmap

The goal is to build a **Pokémon/Legend of Zelda-style 8-bit overworld** as the primary navigation experience for logged-in users. Each community is a building in a town. Users walk around, approach buildings, and enter them to access forum content. Think Roblox, but 8-bit, built for community/hobbyist groups.

### Architecture Decision

**World as navigation (Option B — recommended starting point)**
The 8-bit world is the logged-in home/feed page. Entering a building transitions to the existing community pages (standard Next.js UI). This keeps scope manageable and lets the game engine be built independently of the forum UI.

Option A (world as the full app, with posts/comments rendered inside the world) is a future possibility but is dramatically more work.

---

## Phase 1 — The Game Engine (React/Canvas Component)

Port the tile-based engine from the portfolio site into a reusable React component. Key files will live in `src/lib/game/`.

- [x] `<WorldCanvas />` — React component owning a `<canvas>` element, runs the game loop via `useEffect`
- [x] Tile map renderer — tile grid, procedural tileset, frustum-culled, water animation
- [x] Player movement — WASD/arrows, per-axis collision, walk animation
- [x] Camera that follows the player (viewport offset, clamped to map bounds)
- [x] Collision detection — walk-blocking tiles (SOLID_TILES set), building footprints
- [x] Player movement — touch D-pad (mobile support, auto-detected via pointer:coarse)
- [x] Responsive canvas scaling — fills viewport width on mobile, crisp pixel rendering
- [x] Interaction system — Enter/Space near a door shows prompt + triggers onDoorInteract callback
- [x] Fade transitions — door entry fades to black, fires callback at peak, fades back in
- [ ] Wire in auth state — player is the logged-in user, not an anonymous character

**Note:** The portfolio site (`~/Desktop/portfolio-site`) already has a proven implementation of all of this (tile maps, player movement, collision, overlays, camera, touch D-pad). Start by adapting those patterns into React before writing anything from scratch.

---

## Phase 2 — Static Town

Design the base overworld map before making anything dynamic:

- [ ] Design a "town" tile map — paths, grass, a plaza, districts by category
- [ ] Place a fixed set of community buildings manually (Gaming District, Creative Quarter, Tech Hub, etc.)
- [ ] Each building has a defined door tile that triggers an interaction
- [ ] Interaction shows a community info popup (name, description, member count) with an "Enter" button → routes to `/communities/[slug]`
- [ ] Add a notice board or bulletin board NPC for announcements / global feed

Get something playable before solving dynamic world generation.

---

## Phase 3 — Dynamic World Generation

Communities are user-created, so the world must grow as new ones appear. Recommended approach: **district-based zones**.

- [ ] The map has pre-defined zones by community category (one district per category group)
- [ ] When a community is created, it gets assigned a building slot in its category zone
- [ ] Add a `world_buildings` table to the DB: `community_id`, `map_x`, `map_y`, `building_type`
- [ ] When a community is created, auto-assign a position in the appropriate zone
- [ ] World API endpoint returns community data + map positions
- [ ] Buildings render dynamically at their assigned tile coordinates

Alternative (more complex): procedural town expansion where new communities cause new buildings to appear at the edge of the map.

---

## Phase 4 — Pixel Art Assets

Tile size: **32px** (more readable at modern resolutions than 16px).

Two paths:

- **Draw your own** — full creative control
- **Free asset packs** — LPC (Liberated Pixel Cup, CC-licensed) assets are high quality; RPG Maker RTP-style assets are widely available. Use these for terrain/building shells and customize signage/labels per community.

- [ ] Decide on tile size and finalize art direction
- [ ] Player character sprite sheet (idle + walk in 4 directions)
- [ ] 5–6 building variants (one per category group)
- [ ] Terrain tile set (grass, stone path, water, flowers, fences)
- [ ] 8-bit dialog box / overlay frame for community info popups

---

## Phase 5 — Player Identity & Customization

- [ ] Player character color maps to the user's existing `avatar_color` field
- [ ] Username floats above the character (like a Pokémon trainer name tag)
- [ ] Basic customization screen — pick sprite style/color on account setup or in profile settings
- [ ] Store character appearance in the DB (JSON column on the users table is fine)

---

## Phase 6 — Real-Time Presence

What makes it feel like a living world — seeing other users walking around.

- [ ] Add a WebSocket layer — Next.js doesn't have native WS support; add a small companion Node.js server, or use a managed service (Ably, Pusher)
- [ ] On world load, subscribe to a presence channel
- [ ] Broadcast player position every ~100ms
- [ ] Render other users' characters on the map with their username floating above
- [ ] Show a visual indicator when players are inside a building

This is optional for the first version but is the core "Roblox-like" element.

---

## Recommended Build Order

1. `<WorldCanvas />` with a hardcoded test map, player movement, and camera — get it feeling right
2. Static town with 3–4 hardcoded community buildings + working interaction → community page routing
3. Dynamic building placement from DB
4. Pixel art pass (real sprites replacing placeholder colored rectangles)
5. Player identity & customization
6. Real-time presence (most infrastructure-heavy — do this last)

---

## Security Audit Status

See `AUDIT-NOTES.md` for full details. Current score: **7.2 / 10** (as of Feb 10, 2026).

### Still Outstanding (High Priority)

- [ ] Rate limit content creation routes (posts, comments, reactions, communities, uploads, events)
- [ ] Add Content-Security-Policy header to `next.config.ts`
- [ ] Add CSRF protection (switch cookies to `sameSite: 'strict'` or implement double-submit tokens)
- [ ] Add runtime Zod validation on all API request bodies
- [ ] Add pagination to all list endpoints (currently hardcoded `LIMIT 50`)

### Medium Priority

- [ ] Accessibility pass (alt text, aria-labels, focus traps, aria-describedby on form errors)
- [x] Database migration system — now using Prisma migrations (`prisma migrate dev`)
- [ ] Structured logging (replace `console.error` with Pino)
- [ ] Fix `member_count` drift (use DB trigger or COUNT(\*) at query time)
- [ ] Replace remaining `SELECT *` in community routes
- [ ] Validate reaction types against an enum
