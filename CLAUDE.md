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

Core features built: auth (admin-managed accounts, login, password reset), communities, posts, comments, reactions, events, file uploads, user profiles, rich content editor, feed, admin dashboard, "My Place" personal space, avatar builder, and an explorable isometric world.

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
- **UI tests**: ad hoc Playwright scripts, run from the project root (none are checked in)
- **CI**: `.github/workflows/ci.yml` runs format, lint, tsc, tests, and a production build on every push. The build step needs the same throwaway `JWT_SECRET` and `DATABASE_URL` placeholders the Dockerfile sets, because `next build` evaluates module-level code while collecting page data.

### Commands

| Command                | Purpose                                 |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | Dev server                              |
| `npm run build`        | Production build                        |
| `npm run lint`         | ESLint                                  |
| `npm run format`       | Prettier (auto-fix)                     |
| `npm run format:check` | Prettier (CI check)                     |
| `npm run test`         | Vitest (single run)                     |
| `npm run test:watch`   | Vitest (watch mode)                     |
| `npm run db:migrate`   | Run Prisma migrations                   |
| `npm run db:push`      | Push schema without migration           |
| `npm run db:seed`      | Seed starter communities                |
| `npm run db:studio`    | Open Prisma Studio (DB viewer)          |
| `npm run db:backup`    | Dump the database to private R2 storage |

---

## Core Coding Rules

Adapted from NASA/JPL's "Power of Ten" rules for safety-critical code (Gerard J. Holzmann), kept in language-neutral form (master copy: `~/Desktop/coding-guidelines/CLAUDE.md`). The goal is code that is simple to read, easy to analyze (by humans and tools), and predictable at runtime.

1. **Keep control flow simple.** Avoid deeply nested conditionals, non-local jumps, and clever flow tricks. Prefer early returns for error cases. Avoid recursion unless the depth is obviously bounded and the recursive solution is clearly simpler; if you use it, state the bound.

2. **Give every loop a provable upper bound.** A reader should be able to see at a glance why a loop terminates. When iterating over external or unbounded input (queues, streams, retries, pagination), add an explicit limit or timeout and treat exceeding it as an error. Intentionally infinite loops (the game loop, event loops) are fine, but mark them as intentional.

3. **Use resources predictably.** Avoid unbounded growth of memory, connections, file handles, tasks, or queues. Acquire resources deliberately, release them deterministically, and prefer fixed-size buffers, pools, and caches with eviction in long-running code.

4. **Keep functions short.** A function should be one logical unit that fits on one screen, roughly 60 lines or less. React interpretation for this project: component _logic_ stays under ~60 lines; extract subcomponents when the JSX stops fitting on a screen. If a function needs internal section comments to stay navigable, split it.

5. **Check your assumptions.** Validate parameters and external input at function boundaries (Zod at API boundaries, as already practiced). Use assertions for conditions that should never happen; assertions must be side-effect free, and a failed assumption must lead to an explicit recovery action rather than silent continuation.

6. **Declare data in the smallest possible scope.** Declare variables where they are used, not at the top of a function. Never reuse a variable for a second, unrelated purpose. Prefer immutable bindings and narrow visibility so there are fewer places a value can change.

7. **Never silently ignore a return value or error.** Handle it or propagate it. If ignoring a result is genuinely correct, make that explicit in the language's idiom (`void promise`, `_ = value`) so the reader knows it was a decision, not an accident. In UI code, a caught error must surface user-facing state (`setError(...)`), never vanish.

8. **Limit metaprogramming and build-time magic.** Reflection, code generation, monkey-patching, and dynamic attribute access defeat both static analysis and readers. Keep conditional code paths, feature flags, and environment-dependent branches to a minimum: every flag doubles the number of variants that need testing.

9. **Limit indirection.** Keep data flow and control flow easy to follow: no more than one level of "look elsewhere to understand this." Add an abstraction layer only when there is more than one concrete implementation or a proven need. Avoid `any` entirely (currently at zero — keep it there).

10. **Zero warnings from day one.** Keep `strict: true`, keep `tsc --noEmit` clean, treat lint warnings as errors. If a tool produces a confusing warning, rewrite the code to be more obviously correct rather than suppressing the message. Suppressions (`eslint-disable`, `@ts-expect-error`) require a comment explaining why.

## Comments

- Comment "why," not "what." The code shows what; comments explain intent, constraints, and non-obvious decisions.
- No redundant comments (`close()  // closes the connection`).
- Complex logic always gets comments: concurrency/async patterns, error recovery strategies, edge cases, performance-critical sections (the iso engine's render/update loops qualify).
- Let descriptive names carry the load. Prefer renaming over commenting where a name can say it.
- No TODO or FIXME comments without an issue/ticket reference. No commented-out code in commits.

## Writing Style (README, docs, commit messages, error messages)

- Write like a knowledgeable colleague: clear, direct, friendly. Second person ("you"), active voice, present tense ("returns," not "will return").
- Be concise: every sentence earns its place. Front-load key information; lead with what the reader needs to do.
- Task-oriented over feature-oriented: every piece of information should answer "so what should I do?"
- No marketing language. Frame version comparisons neutrally (what the new version provides, not what the old lacked).
- Warn about mistakes people will actually make, not theoretical ones.
- Short paragraphs (3-4 lines max). Consistent list markers; parallel construction in lists; numbers only for sequential steps.
- No em-dashes in new prose; use commas, periods, or parentheses. Straight quotes only.
- Code examples in docs: one-sentence intro, complete runnable block with a language identifier, key points after. Use realistic data and descriptive names. Mark anti-patterns ❌/✅ and always pair them with the correct alternative.

---

## The 8-Bit World — Current Status

**Architecture decision (still holds):** the world is the logged-in home / navigation layer (Option B). Entering a building transitions to the existing community pages. Rendering forum content _inside_ the world (Option A) remains a future possibility, not current scope.

**The world is isometric 2.5D** (migrated from top-down in v0.6.0 — June 2026). `/world` runs the iso engine over a serializable `IsoWorld` document. Engine code lives in `src/lib/game/`:

- `world-model.ts` — the `IsoWorld` schema (terrain grid + placed-object list + doors + warp shrines + regions), `OBJECT_CATALOG` (per-kind sprite + collision footprint), Zod validation, source-agnostic loader.
- `iso.ts` (2:1 projection), `forest-autotile.ts` + `water-autotile.ts` (ground/water 4-edge blob autotilers), `world-object.ts` (depth-sorted free-standing objects), `character-sheet.ts` (8-direction animator), `iso-collision.ts` (pure collision), `iso-actor.ts` (entity + `computeIntent`→`applyMovement`), `iso-engine.ts` (`createIsoState`/`update`/`render` + camera clamp), `hud.ts` (prompt/toast/warp-menu chrome).
- `worlds/capital.ts` — the authored starter town (`CAPITAL`): one building + Ports door per community, a plaza, streets, a pond, warp shrines. `WorldCanvas` renders whichever world its `WORLD` constant points at (swappable / DB-loadable later).
- `iso-save.ts` — per-device localStorage save (world-space coords). `/iso-lab` + `worlds/lab-town.ts` are a dev sandbox.

**Built for scale (seams in place, not yet active):** the world is modeled as static map + an entity collection (local player = entity 0); input is split from movement (`computeIntent`→`applyMovement`); positions are world-space; collision is a pure function runnable server-side. These let parallel/real-time **multiplayer** and **Builder/Creator** user-generated spaces slot in without an engine rewrite.

**Product concept — Ports:** the forum and the world are two views of the same place; users travel between them deliberately. Door ids are community slugs (`/world?at=<slug>` spawns at that building; walking into a door ports back to `/communities/<slug>`).

**Art:** community buildings use the six Evergrow Town*House sprites, drawn at half size via `OBJECT_CATALOG`'s per-kind `scale` (art is authored oversized for the 32×16 tile). Runtime art (`public/world/{characters,tiles,objects}/`) is gitignored dev copies (BossNelNel character + Evergrow/PixelHoo tiles — see `CREDITS.md`); prod serves it from R2 (`npm run world:upload` after adding art). The avatar builder customizes the \_real* iso character: `avatar-recolor.ts` palette-swaps the sheet's per-part color ramps (hair/skin/shirt/pants/shoes) to the user's stored colors at load, and the builder, Account-settings thumbnail, and world all render through the same `loadCharacterSheet(url, avatar)` pipeline. The hair-style field is stored but its UI is hidden until a second sheet (e.g. `short.png`) is licensed.

**Next (canonical roadmap lives in `README.md` → Roadmap):** Ports v2 (interiors + PC sprites), player identity bound to world position + username above avatar, multiplayer presence.

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

### Operations

- **Backups:** Railway gates scheduled backups behind its Pro plan, so `scripts/backup-db.ts` (nightly via `.github/workflows/backup-db.yml`) dumps to a **private** R2 bucket, verifies the stored object, and prunes past 30 days. `.github/workflows/verify-restore.yml` restores the newest archive weekly into a throwaway Postgres and checks the rows survived. **Database dumps must never go in `R2_BUCKET`** — that bucket is served publicly for world art and media; the script refuses if the two bucket names match.
- **Postgres major version** is shared by production, `docker-compose.yml`, and the backup workflows' `PG_MAJOR` (18 as of September 2026). `pg_dump` and `pg_restore` refuse to read a server newer than themselves, so these must move together, and a dev bump needs a volume reset (`docker compose down -v`). Postgres 18+ images want the volume at `/var/lib/postgresql`, not `/var/lib/postgresql/data`.
- **Verifying a deploy:** `GET /api/version` reports the commit the running instance was built from. Use it rather than assuming, and rather than GitHub's deployment records, which Railway does not write reliably. A healthy site is not evidence of a landed deploy: production once served a two-month-old build because the Railway environment had come unlinked from its git branch. `.github/workflows/deploy-drift.yml` now checks this every morning.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
