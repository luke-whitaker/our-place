# Our Place

An invite-only community platform built on trust, belonging, and genuine human connection. Every account represents someone you've met face-to-face.

![Landing Page](screenshots/01-landing-page.png)

## What is Our Place?

Our Place is a community platform designed around a simple idea: **online spaces should be rooted in real-world relationships.** There is no public registration. Accounts are created in person by existing members who have met you face-to-face. This "web of trust" model means every person on the platform is a real human, vouched for by someone in the community.

The platform combines a Reddit-inspired forum with an **8-bit RPG overworld** where each community is a building in a town. Users walk around, explore, and enter buildings to access forum content — think Roblox meets Reddit, but pixel art.

The forum is fully functional today. The game world is actively in development.

## Philosophy

- **In-Person First** — Accounts are created face-to-face by an admin or trusted member. No anonymous sign-ups, no bots, no strangers. Every user is someone a real person has met and vouched for.
- **Web of Trust** — The community grows organically through real relationships. You can trace every account back to a chain of people who know each other.
- **Your Algorithm, Your Rules** — Users will control their own feed algorithm. No engagement-maximizing dark patterns, no infinite dopamine loops. You decide what you see.
- **Physical Third Spaces** — The long-term vision includes physical community spaces (coffee shops, coworking hubs) where Our Place serves as the digital layer for a real neighborhood.

## Features

### Forum Platform

- **Communities** — Create or join communities organized by category (Gaming, Creative, Tech, etc.)
- **Rich Posts** — Text, photo, video, and rich editor post types
- **Comments & Reactions** — Threaded comments and emoji reactions on posts
- **Events** — Community event creation and management
- **Feed** — Personalized feed with explore and friends tabs
- **My Place** — Personal profile space for each user
- **File Uploads** — Image and media uploads with validation

### Authentication & Security

- **Invite-only accounts** — admin-only account creation via dashboard (`/admin`)
- JWT auth with httpOnly cookies and bcrypt password hashing
- Password reset flow
- Rate limiting on all auth and content creation routes
- Zod schema validation on all API request bodies
- Role-based access control (admin/user roles)

### 8-Bit World (In Progress)

- Tile-based game engine built with React and HTML Canvas (32px tiles)
- Player movement (WASD/arrows + mobile touch D-pad)
- Camera system, collision detection, and walk animations
- Building interaction system with fade transitions
- Responsive canvas scaling for mobile
- **Avatar builder** — gender-neutral character customization (hair, skin, shirt, pants) on first login
- **Procedural frontier generator** — deterministic 500×500 tile world with 6 themed biomes (flower meadow, beach, mountain valley, island, misty grove, ancient ruins), the capital city stamped at its center, passages, a river system, and a mushroom warp network between shrines

## Tech Stack

| Layer      | Technology                     |
| ---------- | ------------------------------ |
| Framework  | Next.js 16 (App Router)        |
| Language   | TypeScript                     |
| ORM        | Prisma 7                       |
| Database   | PostgreSQL                     |
| Styling    | Tailwind CSS                   |
| Auth       | JWT + bcrypt                   |
| Validation | Zod                            |
| Testing    | Vitest (unit), Playwright (UI) |

## Project Structure

```
src/
├── app/
│   ├── api/            # REST API routes
│   │   ├── admin/      # Admin dashboard API (user management)
│   │   ├── auth/       # Login, password reset
│   │   ├── communities/# CRUD, join/leave, posts
│   │   ├── posts/      # Comments, reactions
│   │   ├── feed/       # Personalized, explore, friends
│   │   ├── my-place/   # Personal space posts
│   │   ├── events/     # Community events
│   │   └── upload/     # File uploads
│   ├── admin/          # Admin dashboard (account creation)
│   ├── auth/           # Auth pages (login, password reset)
│   ├── communities/    # Community browsing and detail pages
│   ├── feed/           # Feed dashboard
│   ├── world/          # 8-bit overworld page
│   └── profile/        # User profile
├── components/         # Reusable React components
│   ├── WorldCanvas.tsx # Game engine canvas component
│   ├── PostCard.tsx    # Post display
│   ├── Navbar.tsx      # Navigation bar
│   └── ...
├── generated/prisma/   # Auto-generated Prisma client (not committed)
└── lib/
    ├── game/           # Game engine (sprites, input, engine, types, tileset)
    ├── types/          # TypeScript type definitions
    ├── db.ts           # Prisma client singleton
    ├── schemas.ts      # Zod validation schemas
    ├── pagination.ts   # Pagination utilities
    └── media-utils.ts  # File upload helpers
prisma/
├── schema.prisma       # Database schema (source of truth)
├── migrations/         # Prisma migration history
└── seed.ts             # Seed data (9 starter communities)
scripts/
├── generate-world.ts   # Procedural frontier world generator (deterministic)
├── generate-tiles.lua  # Aseprite script — generate tile sprite sheet
└── generate-player.lua # Aseprite script — generate player sprite sheet
public/world/
├── world.bin           # Generated tile grid (500×500, one byte per tile)
└── world.meta.json     # Spawn, doors, node bounds, passages, mushroom network
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- PostgreSQL (local or hosted)

### Installation

```bash
git clone https://github.com/luke-whitaker/our-place.git
cd our-place
npm install
```

### Database Setup

1. Create a PostgreSQL database (locally or on a service like Railway)
2. Copy `.env.example` to `.env.local` and set your `DATABASE_URL`
3. Run migrations and seed:

```bash
npx prisma migrate dev    # Apply schema migrations
npm run db:seed           # Seed starter communities
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Other Commands

| Command              | Purpose                        |
| -------------------- | ------------------------------ |
| `npm run build`      | Production build               |
| `npm run lint`       | ESLint                         |
| `npm run format`     | Prettier auto-fix              |
| `npm run test`       | Run unit tests                 |
| `npm run test:watch` | Run tests in watch mode        |
| `npm run db:migrate` | Run Prisma migrations          |
| `npm run db:seed`    | Seed starter communities       |
| `npm run db:studio`  | Open Prisma Studio (DB viewer) |
| `npm run world:generate` | Regenerate `public/world/*` from the seeded procedural generator |

## Roadmap

- [x] Core forum platform (communities, posts, comments, reactions)
- [x] Invite-only auth with admin dashboard
- [x] Rich post types and file uploads
- [x] Feed system with explore/friends tabs
- [x] My Place personal profiles
- [x] Security hardening (rate limits, Zod validation, transactions)
- [x] Game engine foundation (canvas, movement, camera, interactions)
- [x] PostgreSQL + Prisma migration (see v0.2.0 below)
- [x] Deploy to Railway (PostgreSQL + Dockerfile — see v0.3.0 below)
- [x] 32px tile upgrade + Aseprite generation pipeline
- [x] Avatar builder (gender-neutral first-login customization)
- [x] Procedural frontier world generator (500×500, 6 biomes, capital stamp, mushroom network)
- [ ] Wire generated world into `WorldCanvas` (Phase B: loader + renderer)
- [ ] Mushroom warp UI (warp menu, discovery tracking, teleport transition)
- [ ] Aseprite pixel-art pass to replace placeholder sprites
- [ ] Dynamic building placement from the DB (community buildings inside the capital)
- [ ] Player identity bound to world position + username rendered above avatar
- [ ] Real-time multiplayer presence

---

## Version History

### v0.3.0 — Railway Deployment + Avatar Builder + Frontier World (April 2026)

**Why:** With the platform on Postgres and the forum stable, this cycle focused on three things: getting Our Place actually running in production, making the first-login experience feel personal, and laying the groundwork for the 8-bit world to be more than a bare test map.

**What changed:**

- **Deployed to Railway** — production Dockerfile (multi-stage build with standalone Next.js output), PostgreSQL service linked, healthcheck on `/`. Several iterations to get the Docker runner stage correct: full `node_modules` copy (native binaries + Prisma/effect runtime deps), Prisma schema copied into deps stage, dummy env vars for build-time Next.js compilation, `.npmrc` removed so native binary installs work.
- **Avatar builder** — gender-neutral character customization shown on first login. Hair style, skin tone, shirt color, pants color, stored as JSON on the user record. No male/female selector.
- **Audit overhaul** — invite-only auth tightened, admin dashboard cleanup, `createUserSchema` consolidation (removed orphaned `registerSchema`), code-quality pass across the admin surface.
- **32px tile upgrade** — tile size doubled from 16px to 32px for better readability at modern resolutions. New Aseprite Lua scripts (`scripts/generate-tiles.lua`, `scripts/generate-player.lua`) for sprite-sheet generation.
- **Procedural frontier world generator** (`scripts/generate-world.ts`, `npm run world:generate`) — deterministic 500×500 tile world built from a single seed. 9-stage pipeline: base fill → 8 passages (tree-walled corridors with tall-grass patches) → lakes + rivers (Iowa River N-S) → 6 themed nodes (flower meadow, beach, mountain valley, island, misty grove, ancient ruins) → capital stamp at (220,230) → wilderness fill (noise-driven forest vs. clearing) → border wall → mushroom warp network (1 capital gate + 6 node shrines, full-mesh connections). Emits `public/world/world.bin` (one byte per tile) and `world.meta.json` (spawn, doors, node bounds, passages, mushroom network).
- **8 new tile types** — `TALL_GRASS`, `FLOWER_RED/YELLOW/PURPLE`, `SAND`, `MOUNTAIN`, `MUSHROOM`, `STONE_RUIN` — palette entries and placeholder procedural sprites (to be refined in Aseprite later).
- **Seed trimmed** — 12 starter communities → 9, with simpler names.

**Not yet done (intentional):** The generated world is on disk but not yet read by `WorldCanvas`. Phase B — loader + renderer + mushroom warp UI — is the next cycle.

### v0.2.0 — PostgreSQL + Prisma Migration (April 2026)

**Why:** SQLite (better-sqlite3) was the right choice for prototyping — zero setup, file-based, fast to iterate. But Our Place is a multi-user platform headed for production deployment. SQLite can't handle concurrent writes from multiple users reliably, and it doesn't work on most cloud hosting platforms (Railway, Render, etc.) without workarounds. PostgreSQL is the industry standard for this kind of app.

**What changed:**

- **Database engine**: SQLite (better-sqlite3) → PostgreSQL, using `@prisma/adapter-pg` driver
- **ORM**: Raw SQL queries → Prisma 7 with full type-safe client
- **Schema**: Defined in `prisma/schema.prisma` (single source of truth) instead of inline `CREATE TABLE` statements in `db.ts`
- **Migrations**: Runtime column-checking hacks (`PRAGMA table_info`) → Prisma's migration system (`prisma migrate dev`)
- **Seeding**: Moved from `initializeDatabase()` to a dedicated `prisma/seed.ts` script
- **All 18 API routes** converted from synchronous `db.prepare().run/get/all()` to async Prisma client calls
- **SQLite-specific syntax** replaced: `datetime('now')` → `@default(now())`, `MAX(0, x)` → `GREATEST(0, x)`, `COLLATE NOCASE` → Prisma's `mode: "insensitive"`, `INSERT OR IGNORE` → `upsert`
- **Config updates**: Removed `better-sqlite3` from dependencies, updated `next.config.ts`, added Prisma scripts to `package.json`

**What didn't change:** All API response shapes are identical. The frontend is unaffected — no client-side code was modified.

### v0.1.0 — Initial Build (Feb 2026)

Forum platform with full auth, communities, posts, comments, reactions, events, file uploads, feed, and "My Place" profiles. 8-bit game engine prototype with tile rendering, player movement, camera system, and building interactions. Built with Next.js 16, TypeScript, SQLite, and Tailwind CSS.

---

## Related

- [Portfolio Site](https://github.com/luke-whitaker/portfolio-site) — My pixel-art RPG portfolio, the prototype that inspired the game engine in this project

## Author

**Luke Whitaker** — Linguist, researcher, and developer working at the intersection of language, technology, and digital interfaces.
