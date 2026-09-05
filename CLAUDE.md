# Our Place — Project Instructions

## What this is

**Our Place** is an invite-only, in-person-first community platform with two faces: a familiar forum and an explorable isometric 8-bit world. Both exist to turn digital interaction into real-world connection. It is live at https://www.ourplaceonline.com with a small group of real members since September 2026, so every push to `main` reaches people.

Next.js 16 (App Router) + TypeScript, PostgreSQL via Prisma 7, Tailwind, JWT auth in httpOnly cookies, Zod, Vitest, ad hoc Playwright, Cloudflare R2 for media and world art. `package.json` is the source of truth for versions and scripts.

## Product boundaries (read before any product decision)

- **Rooted in the real world.** Online activity should pull people back out into their actual community. The north star for any feature: does this strengthen a real-world relationship?
- **A place, not an engagement machine.** No infinite scroll, no ranking, no dark patterns. Feeds are chronological and say under the heading exactly what they show.
- **Web of trust.** Admins create accounts only for people an existing member has met face to face, and every account records its inviter. **Never reintroduce public registration.**
- **Anti-echo-chamber.** Weigh features against siloing people.
- **Two views of one place (Ports).** The forum and the world are the same place; members travel between them deliberately. As of September 2026 the world also hosts content (per-member islands, later user-placed sprites), not only navigation. Details in `.claude/rules/world-engine.md`.

## Where things live

- `README.md`: public overview, roadmap checklist, and version history (the canonical changelog).
- `ROADMAP.md` (local, gitignored): decisions to revisit, cost strategy, open product questions.
- `LAST-SESSION.md` (local, gitignored): the previous session's handoff. Read its first entry before planning work.
- `audits/` (local, gitignored): security audit records.
- `.claude/rules/`: path-scoped conventions for API routes, the world engine, and operations. They load when you open matching files, so check there before changing a route, the engine, or a workflow.
- `CREDITS.md` and `assets/world/README.md`: art licensing and the art pipeline. Purchased art is never committed.

## Commands

| Command                | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `npm run dev`          | Dev server (port 3000)                      |
| `npm run build`        | Production build                            |
| `npm run lint`         | ESLint, zero warnings allowed               |
| `npm run format`       | Prettier (auto-fix); `format:check` in CI   |
| `npm run test`         | Vitest (single run); `test:watch` for watch |
| `npm run test:routes`  | API route tests against a real Postgres     |
| `npm run db:migrate`   | Prisma migrations against the dev database  |
| `npm run db:generate`  | Regenerate the Prisma client after install  |
| `npm run db:seed`      | Seed the starter communities                |
| `npm run db:studio`    | Prisma Studio                               |
| `npm run db:backup`    | Dump the database to private R2 storage     |
| `npm run world:upload` | Upload world art to R2 (before deploying)   |

`docker compose up -d` starts the local Postgres. `.npmrc` disables install scripts, so run `db:generate` after a fresh install.

## Conventions

Prettier owns formatting: 2-space indent, double quotes, semicolons, trailing commas, 100-char lines.

| Context              | Convention                         | Example                       |
| -------------------- | ---------------------------------- | ----------------------------- |
| React components     | PascalCase files and exports       | `PostCard.tsx`                |
| Utility files        | kebab-case                         | `media-utils.ts`              |
| API routes           | kebab-case dirs, always `route.ts` | `api/my-place/posts/route.ts` |
| Variables, functions | camelCase                          | `loadCommunityFeed`           |
| Constants            | UPPER_SNAKE_CASE                   | `MAX_IMAGE_SIZE`              |
| Types, interfaces    | PascalCase                         | `PostType`                    |
| DB tables, columns   | snake_case                         | `community_members`           |
| IDs                  | UUID v4, never auto-increment      | `uuidv4()`                    |

Imports use the `@/` alias, ordered: type imports, Next/React, external packages, `@/lib/*`, `@/components/*`. Types are split by domain under `src/lib/types/` with a barrel `index.ts`; game types live with the engine.

## Core coding rules

Adapted from NASA/JPL's "Power of Ten" (Holzmann). The goal is code that is simple to read, easy to analyze, and predictable at runtime.

1. **Simple control flow.** Early returns for error cases; no deep nesting or clever jumps. Recursion only with an obvious, stated bound.
2. **Every loop has a provable bound.** Iterating external or unbounded input (queues, retries, pagination) gets an explicit limit or timeout, and exceeding it is an error. Deliberately infinite loops (the game loop) are marked as such.
3. **Predictable resources.** No unbounded growth of memory, connections, tasks, or caches; release deterministically; fixed-size buffers and eviction in long-running code.
4. **Short functions.** One logical unit, and no more lines than the job needs. If the same function can be written with fewer lines and still achieve the same goal, write it that way. A function that needs section comments to navigate should be split. For components, judge the state rather than the length: a component juggling many independent pieces of state is the one to break up, because that is where "I changed one thing and another silently went stale" bugs live. A long, flat block of JSX is not a violation.
5. **Check assumptions at boundaries.** Zod at API boundaries; assertions for conditions that should never happen, side-effect free, with an explicit recovery rather than silent continuation.
6. **Smallest scope.** Declare where used, never reuse a variable for a second purpose, prefer immutable bindings.
7. **Never silently ignore a result or error.** Handle it or propagate it. Deliberate ignores are explicit (`void promise`). In UI code a caught error must surface user-facing state, never vanish.
8. **Limit metaprogramming and flags.** Every feature flag doubles the variants to test.
9. **Limit indirection.** At most one level of "look elsewhere to understand this." Add an abstraction only for a second concrete implementation or a proven need. No `any` (currently zero; keep it there).
10. **Zero warnings.** `strict: true`, `tsc --noEmit` clean, lint warnings are errors. Rewrite confusing code rather than suppressing a warning; any suppression carries a comment saying why.

## Comments

Explain why, not what. No redundant comments, no TODOs without a ticket, no commented-out code. Complex logic always gets a comment: concurrency, error recovery, edge cases, and the engine's render and update loops.

## Writing style (docs, commits, error messages)

Clear, direct, friendly. Second person, active voice, present tense. Front-load what the reader needs to do. Short paragraphs, parallel lists, numbers only for sequential steps. No marketing language, no em-dashes in new prose, straight quotes. Code examples get a one-sentence intro, a complete runnable block with a language tag, and key points after; mark anti-patterns with a correct alternative beside them.

## Before you say something is done

- Run `npm run format:check`, `npm run lint`, `npx tsc --noEmit`, `npm run test`, and `npm run test:routes`. All five clean, zero warnings.
- Verify UI in a real browser with an ad hoc Playwright script, at realistic data sizes. A 64 KB upload bug once hid for three months behind tiny fixtures.
- After a deploy, confirm production with `GET /api/version`. Never assume a push landed.
- Commit or push only when Luke asks. Pushing `main` deploys to real members.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
