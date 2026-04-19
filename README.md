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

- Tile-based game engine built with React and HTML Canvas
- Player movement (WASD/arrows + mobile touch D-pad)
- Camera system, collision detection, and walk animations
- Building interaction system with fade transitions
- Responsive canvas scaling for mobile

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
    ├── game/           # Game engine (sprites, input, engine, types)
    ├── types/          # TypeScript type definitions
    ├── db.ts           # Prisma client singleton
    ├── schemas.ts      # Zod validation schemas
    ├── pagination.ts   # Pagination utilities
    └── media-utils.ts  # File upload helpers
prisma/
├── schema.prisma       # Database schema (source of truth)
├── migrations/         # Prisma migration history
└── seed.ts             # Seed data (12 starter communities)
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

## Roadmap

- [x] Core forum platform (communities, posts, comments, reactions)
- [x] Invite-only auth with admin dashboard
- [x] Rich post types and file uploads
- [x] Feed system with explore/friends tabs
- [x] My Place personal profiles
- [x] Security hardening (rate limits, Zod validation, transactions)
- [x] Game engine foundation (canvas, movement, camera, interactions)
- [x] PostgreSQL + Prisma migration (see v0.2.0 below)
- [ ] Deploy to Railway (PostgreSQL + Dockerfile)
- [ ] Static town map with community buildings
- [ ] Dynamic world generation from database
- [ ] Pixel art assets (sprites, terrain, buildings)
- [ ] Player identity tied to user accounts
- [ ] Real-time multiplayer presence

## Next Steps — Deployment

The database has been migrated to PostgreSQL via Prisma. The remaining steps to get Our Place live:

### Step 1: Set up PostgreSQL on Railway

- Create a PostgreSQL service in Railway (one-click provisioning)
- Note the connection string (Railway provides `DATABASE_URL` automatically)

### Step 2: Add a Dockerfile

Create a production Dockerfile for the Next.js app:

- Multi-stage build (install deps → build → run)
- Use `npm run build` + `npm run start` (not dev mode)
- Expose port 3000

### Step 3: Deploy to Railway

- Connect the GitHub repo to Railway
- Add the PostgreSQL service + link it to the app
- Set environment variables: `DATABASE_URL` (auto-linked from PostgreSQL service), `JWT_SECRET` (strong random string)
- Deploy and verify

### Step 4: Update README with live URL

Add the public Railway URL to this README, similar to StatLab's setup.

---

## Version History

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
