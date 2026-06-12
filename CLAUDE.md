# Our Place — Project Instructions & Roadmap

## Project Overview

**Our Place** is a community platform built on one conviction: **online spaces should be rooted in real-world relationships.** It is invite-only and in-person-first, and it has two faces — a familiar forum and an explorable 8-bit world — both pointed at the same goal: turning digital interaction into real-world connection.

Tech stack:

- **Next.js 16** (App Router) + **TypeScript**
- **PostgreSQL** via **Prisma 7** ORM (schema in `prisma/schema.prisma`)
- **Tailwind CSS** for styling
- **JWT** auth with httpOnly cookies, bcrypt (12 rounds)
- **Zod** for validation, **Vitest** for unit tests, **Playwright** for UI tests
- **Cloudflare R2** for media uploads — signed PUTs via aws4fetch in `src/lib/storage.ts`

Core features built: auth (admin-managed accounts, login, password reset), communities, posts, comments, reactions, events, file uploads, user profiles, rich content editor, feed, admin dashboard, "My Place" personal space, avatar builder, and a procedural world generator.

---

## Project Vision & Philosophy

Read this before making product decisions — it is the "why" behind the constraints.

- **Rooted in the real world.** Our Place exists to drive in-person connection, not to replace it. Online activity (events, posts, plans) should pull people back out into their actual community. The design north star: _does this strengthen a real-world relationship?_
- **Analog feel in a digital space.** The experience should feel less like an engagement machine and more like a _place_. No infinite-scroll dopamine loops, no engagement-maximizing dark patterns.
- **Two components, one purpose.**
  1. **Forum** — Reddit-/Discord-style community interaction: follow communities, post, comment, react, run events.
  2. **World** — an 8-bit explorable overworld you "teleport" into. Each community is a building. The point is to wander and build rather than scroll — to leave room for boredom that becomes creativity.
- **Web of trust.** Accounts are created only through a direct, face-to-face connection with an existing member. This is how the platform expands beyond the creator, and it is a hard product boundary — **never reintroduce public registration.**
- **Anti-echo-chamber.** Social media that fosters social connection instead of siloing people. This is the differentiator; weigh features against it.

## Account Model

Our Place uses an **invite-only, in-person-first** account model. There is no public registration. Only admins can create accounts via the admin dashboard (`/admin`). Every account represents someone an existing member has met face-to-face. See `src/app/api/admin/users/route.ts` and `src/app/admin/page.tsx`.

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

- `auth.ts` — AuthPayload, AVATAR_COLORS
- `forum.ts` — Community, Post, Comment, CommunityMember, and API response types + COMMUNITY_CATEGORIES
- `index.ts` — barrel re-export (all existing `@/lib/types` imports work unchanged)

Game engine types live alongside the engine in `src/lib/game/`.

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

| Command                  | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| `npm run dev`            | Dev server                                                |
| `npm run build`          | Production build                                          |
| `npm run lint`           | ESLint                                                    |
| `npm run format`         | Prettier (auto-fix)                                       |
| `npm run format:check`   | Prettier (CI check)                                       |
| `npm run test`           | Vitest (single run)                                       |
| `npm run test:watch`     | Vitest (watch mode)                                       |
| `npm run db:migrate`     | Run Prisma migrations                                     |
| `npm run db:push`        | Push schema without migration                             |
| `npm run db:seed`        | Seed starter communities                                  |
| `npm run db:studio`      | Open Prisma Studio (DB viewer)                            |
| `npm run world:generate` | Regenerate `public/world/*` from the procedural generator |

---

## The 8-Bit World — Current Status

**Architecture decision (still holds):** the world is the logged-in home / navigation layer (Option B). Entering a building transitions to the existing community pages. Rendering forum content _inside_ the world (Option A) remains a future possibility, not current scope.

**Done:** the game engine (`<WorldCanvas />`, tile renderer, player movement, camera, collision, touch D-pad, responsive scaling, interaction prompts, fade transitions), the 32px tile upgrade + Aseprite pipeline, the gender-neutral avatar builder (first-login), the deterministic procedural frontier generator (`scripts/generate-world.ts`, `npm run world:generate`), and **Ports v1** (v0.4.0): the generated 500×500 world is live at `/world` — loader, mushroom warp menu with discover-to-unlock, region toasts, localStorage position persistence, and two-way porting (Portal buttons on My Place/community pages ↔ doors back to forum view).

**Product concept — Ports:** the forum and the world are two views of the same place; users travel between them deliberately. Door ids in `world.meta.json` match community slugs (`/world?at=<slug>` spawns at that building).

**Next (the canonical roadmap lives in `README.md` → Roadmap):**

- Ports v2 — building interiors with PC sprites: enter a building, sit at the PC, choose "log on" (exit to that page's forum view) or warp to another PC (PCs join the mushroom warp network)
- Aseprite pixel-art pass to replace placeholder sprites
- Dynamic building placement from the DB (community buildings inside the capital)
- Player identity bound to world position; username rendered above the avatar
- Real-time multiplayer presence (most infra-heavy — do this last)

Game engine code lives in `src/lib/game/`.

> Historical note: the engine was adapted from the pixel-art RPG in `~/Desktop/portfolio-site`.

---

## Security & Audit Status

Detailed audit notes and the launch checklist are kept **locally, not committed** (this is a public repo).

Security conventions reflected in the code:

- **CSRF:** auth cookies use `sameSite: "strict"` (`src/app/api/auth/*`).
- **CSP:** nonce-based, per-request, in `src/proxy.ts`; pages render dynamically so the nonce applies (see the note in `src/app/layout.tsx`).
- **Supply-chain:** `.npmrc` disables install scripts by default; `engines` pins node `>=20`. Run `npm run db:generate` after a fresh `npm install` (generates the Prisma client).
- **Validation & data:** Zod on all request bodies; rate limiting on auth + content routes; explicit Prisma `select` (no `SELECT *`); count updates wrapped in `$transaction`.
- **Headers:** `next.config.ts` sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

**Done:** rate limiting (auth + content routes), Zod validation on all request bodies, pagination on list endpoints, `$transaction`-wrapped count updates, reaction-type validation against the enum, security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy), Prisma migrations.
