---
paths:
  - "src/app/api/**"
  - "src/lib/schemas.ts"
  - "src/lib/auth.ts"
  - "src/lib/rate-limit.ts"
  - "src/lib/api-client.ts"
  - "src/lib/types/**"
---

# API routes and the client that calls them

## Handler shape

Every `route.ts` follows the same order. Copy a neighbouring route rather than improvising.

1. `try { ... } catch (error) { console.error("<Route> error:", error); ... }` returning a generic 500.
2. Auth first: `requireAuth()` or `requireAdmin()` from `@/lib/auth` (they return `{ error }` as a ready Response), or `getAuthUser()` for a route that also works logged out.
3. Rate limit with the route's limiter from `@/lib/rate-limit`; on refusal return 429 with a `Retry-After` header. Content limiters key on `auth.user.userId`; auth routes key on `getClientIp(request)`.
4. Validate the body with the route's Zod schema from `@/lib/schemas` via `safeParse`; return 400 with `getZodErrorMessage(parsed)`.
5. Prisma with an explicit `select`, never the whole row. Two writes that must both exist, or a write plus a counter update, go in one `prisma.$transaction`.
6. Map Prisma's camelCase to the snake_case wire shape by hand. This layer is a SQLite-era fossil; keep it consistent rather than half-migrating it. Post listings share `mapPostRow` in `@/lib/post-helpers`; add a post field there once, not in six routes.

## Route tests

Every route that enforces a rule (a permission, a counter, a gate) gets a `route.route.test.ts` beside it, run by `npm run test:routes` against a real Postgres (`vitest.routes.config.mts`, the `ourplace_test` database locally, a service container in CI). Copy an existing one:

- `vi.mock("@/lib/auth", ...)` to choose the caller, because `requireAuth` and `getAuthUser` read cookies through `next/headers`, which does not exist outside a Next request. Return the exact `{ user }` or `AuthPayload | null` shape the route expects.
- Build rows with `src/test/route-helpers.ts` (`createTestUser`, `createTestCommunity`, `joinCommunity`, `createTestPost`, `jsonRequest`) and call the exported handler directly with `params: Promise.resolve({...})`.
- Tables truncate after every test and files run serially, so tests never depend on each other. `npm run test` stays database-free; do not put a route test under the plain `*.test.ts` pattern.

## Notifications

A route that should tell someone about something calls `notify(tx, {...})` from `@/lib/notifications` inside the same `prisma.$transaction` as the write it's about, so the notification exists exactly when that thing does. `notify` skips the actor's own notifications. Point the row at its cause (`friendshipId`, `reactionId`, `commentId`, `postId`): the foreign keys cascade, so undoing the thing removes its notification with no cleanup code. Today's kinds are `friend_request`, `friend_accepted` (both through `acceptFriendRequest` in `@/lib/friends`), `reaction` (never a dislike), `comment`, `gathering_invite`, `gathering_cancelled`, and `gathering_unplanted`. The gathering kinds are written with `createMany` in `@/lib/gatherings`, the cancel route, and the sweep, because a community gathering can notify hundreds at once. The host is never a recipient of the first two, which is the one check `notify` adds; `gathering_unplanted` goes to the host too, since it tells them their own gathering was cancelled. The page groups reactions per post (`groupNotifications`); the navbar shows a dot, never a count. After a schema change, restart the dev server: it caches its Prisma client, so a new model is undefined until it restarts.

## Gatherings in the world

- A world gathering's Event Mushroom is an item (`kind: "event_mushroom"`, `gathering_id`) until planted, then columns on the gathering (`mushroom_world`, `mushroom_col`, `mushroom_row`, `planted_at`). `POST`/`DELETE /api/gatherings/[id]/mushroom` plant and pick up; both are host-only, before the start, and guard their writes on the row's state so a race can't plant twice. `activeMushroomWhere` in `@/lib/event-mushrooms` is the one definition of "standing now" (scheduled, planted, not ended).
- **An unplanted world gathering is cancelled at its start** by `cancelUnplanted` in `@/lib/gathering-sweep`: a background timer once a minute (started in `src/instrumentation.ts`; single instance, like the presence hub) plus a lazy call in `gatheringAccess`, the calendar route, and the notifications route, so nothing depends on the timer alone. It cancels at most `SWEEP_BATCH` a run, each guarded on still being scheduled and unplanted, so it's idempotent, and notifies the host and everyone who accepted (`gathering_unplanted`).
- **The island exception:** `requireIslandVisit` in `@/lib/islands` lets a viewer who may open a gathering onto its host's island while that gathering's mushroom stands there, even if the island's own setting wouldn't. The island route only honours it with `?gathering=<id>`; live presence (`checkWorldAccess`) honours any such gathering for the island world only, never the house.

## Responses

- Errors: `{ error: "Human-readable message." }` with the right status: 400 validation, 401 not logged in, 403 not allowed, 404, 409 conflict, 429 rate limited, 500.
- GET returns data directly: `{ posts: [...] }`, `{ community, membership, members }`.
- Mutations return `{ message: "...", ...relevantData }`.
- Lists paginate with `parsePagination` and `paginateResults` from `@/lib/pagination`: fetch `limit + 1`, return `hasMore` and `page`.
- Feeds are chronological (`createdAt desc`) and the UI says so under the heading. If you change an ordering, change the sentence in `src/app/feed/page.tsx` too.

## Auth facts

- JWT, 24 hours, in an `httpOnly` `sameSite: "strict"` cookie named `auth_token`. The options live in `AUTH_COOKIE_OPTIONS`; every cookie write uses them.
- `getAuthUser` hits the database on every request: it revokes tokens issued before a password change and takes `role` from the row rather than the token, so promotions and demotions apply immediately.
- `is_verified` is always true because accounts are admin-created. Treat those branches as vestigial.
- Accounts exist only through `POST /api/admin/users` with a required `invited_by_id`. There is no registration route, and there must never be one.
- Tokens are signed and verified with `HS256` only (`JWT_ALGORITHM` in `auth.ts`); never let a token pick its algorithm.
- Login has two limiters: `loginLimiter` per IP and `accountLoginLimiter` per account (keyed on the user id, or the typed name when no account matches, so a missing account answers the same 429). Both count failures only (`peek` then `recordFailure`, after the user lookup), and a browser holding a valid `trusted_device` cookie for that account skips both, so a stranger can't lock a member out, even from the same network. The cookie is set on every successful sign-in, scoped to `/api/auth/login`, and revoked by a password change.
- Reset codes are stored only as `hashResetCode(code)` (an HMAC keyed with `JWT_SECRET`, so rotating the secret voids outstanding codes), compared with `constantTimeEqual`, and wiped after `RESET_CODE_MAX_ATTEMPTS` wrong guesses.
- New passwords go through `newPassword()` in `schemas.ts` (8 to 128 characters). Schemas that only check a password use the looser `PASSWORD_CHECK_MAX`, so members with longer, older passwords can still sign in.
- Post media URLs must pass `isAllowedMediaUrl` (under `R2_PUBLIC_BASE_URL`, or a YouTube or Vimeo video), in the media array and in rich posts' blocks.

## Client side

- Client components call the API through `apiFetch` and `userMessage` from `@/lib/api-client`, never bare `fetch`. It throws `ApiError` on non-2xx and sends a 401 to the login page; the login form passes `redirectOnUnauthorized: false`.
- A caught error must set visible state (`setError(...)`). Never log-and-continue.
- Wire types live in `src/lib/types/` (`forum.ts`, `social.ts`, `auth.ts`, `game.ts`) and are re-exported from the barrel.

## Security conventions already in place

CSRF via `sameSite: "strict"`; per-request nonce CSP in `src/proxy.ts`, with pages rendered dynamically so the nonce applies; `X-Forwarded-For` read from the right, `TRUSTED_PROXY_HOPS` deep; HSTS and the other security headers in `next.config.ts`; Zod on every body; in-memory rate limiting (single instance; Redis only if we ever scale out).
