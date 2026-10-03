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

## Merging state from several devices

A row that more than one device writes, and where a write should only ever add (map discoveries in `world_discoveries`), merges instead of overwriting: create the row if missing (`createMany` with `skipDuplicates`), lock it with `SELECT ... FOR UPDATE` inside the same `$transaction`, then read, merge, and write. `mergeDiscoveries` in `@/lib/discoveries` is the example: bitwise OR for the visited bitmap, set union for shrine ids, so a repeated or late save never loses anything.

## Notifications

A route that should tell someone about something calls `notify(tx, {...})` from `@/lib/notifications` inside the same `prisma.$transaction` as the write it's about, so the notification exists exactly when that thing does. `notify` skips the actor's own notifications. Point the row at its cause (`friendshipId`, `reactionId`, `commentId`, `postId`): the foreign keys cascade, so undoing the thing removes its notification with no cleanup code. Today's kinds are `friend_request`, `friend_accepted` (both through `acceptFriendRequest` in `@/lib/friends`), `reaction` (never a dislike), `comment`, `gathering_invite`, `gathering_cancelled`, `gathering_unplanted`, `gathering_time_changed`, and `call_invite` (through `notify`, pointing at `call_id`, so it goes when the call's row does). The gathering kinds are written with `createMany` in `@/lib/gatherings`, the cancel route, and the sweep, because a community gathering can notify hundreds at once. The host is never a recipient of the first two, which is the one check `notify` adds; `gathering_unplanted` goes to the host too, since it tells them their own gathering was cancelled. The page groups reactions per post (`groupNotifications`); the navbar shows a dot, never a count. After a schema change, restart the dev server: it caches its Prisma client, so a new model is undefined until it restarts.

## Gathering emails

The one kind of news that leaves the site (Luke, October 3, 2026): an email when you're invited to a gathering, when one you're still invited to (pending or going) is cancelled, by its host, by account deletion, or by the unplanted sweep, and when its host changes the time. `emailGathering` and `emailStillInvited` in `@/lib/gathering-emails` build and send them. Rules:

- **After the commit, never awaited, never throwing.** Callers fire them with `void` once their transaction has committed; a failed send is logged and nothing else changes, since the in-site notification already exists.
- **Bounded.** Recipients come from one gathering's invite list (at most `MAX_COMMUNITY_INVITEES + MAX_PICKED_INVITEES`), sent through Resend's batch endpoint 100 at a time with a short pause between batches for its rate limit.
- **Skipped:** the host, deleted accounts, anyone with `users.email_gatherings` off, and anyone in a block with the host.
- **Contents:** title, host, the time in Central time, and a link built from `PUBLIC_SITE_URL` (production's address by default). Never the guest list, the description, or the address, since email gets forwarded. Every interpolated value is escaped in the HTML.
- **Unsubscribe:** every email links to `/unsubscribe?token=` (a page that asks first) and carries RFC 8058 `List-Unsubscribe` headers pointing at `POST /api/unsubscribe?token=`. The token is `userId.hmac` from `@/lib/unsubscribe`, keyed with the server secret (`@/lib/server-secret`), for this one purpose. That route has no GET, so a mail scanner following a link can't unsubscribe anyone. Account settings has the same switch.

## Changing a gathering's time

`PATCH /api/gatherings/[id]` lets the host move a gathering until it starts; nothing else about it is editable. `moveGathering` in `@/lib/gatherings` guards the update on the row still being scheduled and not started, rewrites the invitation letters' words (they carry the time), keeps every answer, and notifies everyone still invited (`gathering_time_changed`). The mushroom rules key off the row's current times, so a planted mushroom stays put and the unplanted sweep follows the new start.

## Gatherings in the world

- A world gathering's Event Mushroom is an item (`kind: "event_mushroom"`, `gathering_id`) until planted, then columns on the gathering (`mushroom_world`, `mushroom_col`, `mushroom_row`, `planted_at`). `POST`/`DELETE /api/gatherings/[id]/mushroom` plant and pick up; both are host-only, before the start, and guard their writes on the row's state so a race can't plant twice. `activeMushroomWhere` in `@/lib/event-mushrooms` is the one definition of "standing now" (scheduled, planted, not ended).
- **An unplanted world gathering is cancelled at its start** by `cancelUnplanted` in `@/lib/gathering-sweep`: a background timer once a minute (started in `src/instrumentation.ts`; single instance, like the presence hub) plus a lazy call in `gatheringAccess`, the calendar route, and the notifications route, so nothing depends on the timer alone. It cancels at most `SWEEP_BATCH` a run, each guarded on still being scheduled and unplanted, so it's idempotent, and notifies the host and everyone who accepted (`gathering_unplanted`).
- **The island exception:** `requireIslandVisit` in `@/lib/islands` lets a viewer who may open a gathering onto its host's island while that gathering's mushroom stands there, even if the island's own setting wouldn't. The island route only honours it with `?gathering=<id>`; live presence (`checkWorldAccess`) honours any such gathering for the island world only, never the house.

## World state with a cap

A route that adds something a member owns to a shared place under a per-member cap (`POST /api/world/plants`) counts and inserts inside one transaction that first locks the member's own row (`SELECT id FROM users WHERE id = $1 FOR UPDATE`), so two requests racing can't both pass the count. A one-per-tile rule is a unique index (`world_plants (world_id, col, row)`), answered as a 409 on P2002. Anything secret until a time (a seed's color before it blooms) is filtered in the wire mapper (`toPlantWire`), never in the client.

## Deleting an account

`POST /api/auth/account/delete` (password required, admins refused) runs `deleteAccount` in `@/lib/account-deletion` in one transaction. The member picks `leave_posts` or `remove_everything`. The `users` row is never deleted: it becomes a tombstone (`deleted_at` set, username `former-<id>`, display name "A former member", a placeholder email, an unusable password hash, `passwordChangedAt` now so every token dies), so whatever still points at it keeps a valid author. Every query that finds members by name or lists them filters `deletedAt: null` (directory, profile, friend request by username, gathering invitees, admin list), and the client renders `isFormerMember(username)` (`@/lib/former-member`) as plain text, never a profile link. When you add a relation to `User`, add a line here and a step in `deleteAccount`.

| Relation                                                                   | `leave_posts`                                                                                                                                                                  | `remove_everything`                                                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Posts (and their media rows)                                               | Stay, author shown as "A former member"                                                                                                                                        | Deleted, with everyone's comments, reactions, and notifications on them; uploaded files deleted from R2 after the commit (production only) |
| Their comments on any post                                                 | Stay, as "A former member"                                                                                                                                                     | Deleted; each post's `comment_count` drops                                                                                                 |
| Their reactions                                                            | Deleted; counts drop (a like or dislike is an act of a person, not content)                                                                                                    | Same                                                                                                                                       |
| Their poll votes                                                           | Deleted; each option's `vote_count` drops (a vote is an act of a person)                                                                                                       | Same; polls on their own deleted posts cascade                                                                                             |
| Friendships, community memberships                                         | Deleted; each community's `member_count` drops                                                                                                                                 | Same                                                                                                                                       |
| Blocks they made or received                                               | Deleted (a tombstone can't be reached anyway)                                                                                                                                  | Same                                                                                                                                       |
| Communities they created                                                   | Stay (shared spaces); `creator_id` keeps pointing at the tombstone                                                                                                             | Same                                                                                                                                       |
| Gatherings they host                                                       | Unended ones cancelled via `cancelGathering` (guests going get `gathering_cancelled`, everyone still invited an email after the commit); address and description wiped on all  | Same, then every hosted gathering not cancelled just now is deleted                                                                        |
| Their invitations and answers                                              | Deleted                                                                                                                                                                        | Same                                                                                                                                       |
| Voice calls                                                                | The route takes them out of any call first (`leaveEveryCall`); their `call_invites` rows go; calls they started or invites they sent keep their dates, with the person cleared | Same                                                                                                                                       |
| Items they hold (pockets, mailbox, desk, head)                             | Deleted                                                                                                                                                                        | Same                                                                                                                                       |
| Letters and gifts they sent                                                | Stay with the recipient, signed "A former member"                                                                                                                              | Same                                                                                                                                       |
| Notebook pages, outfits, NPC gifts, activity days, map discoveries, plants | Deleted (plants leave the world)                                                                                                                                               | Same                                                                                                                                       |
| Notifications they received or caused                                      | Deleted, except the cancel notices written in the same transaction                                                                                                             | Same                                                                                                                                       |
| Old `events` / `event_rsvps`                                               | Deleted                                                                                                                                                                        | Same                                                                                                                                       |
| Members they vouched for (`invited_by_id`)                                 | Keep pointing at the tombstone, so People reads "Invited by A former member"                                                                                                   | Same                                                                                                                                       |

## Blocking

A block row has a direction (`blocker_id` made it, and only they see or lift it), but every check is symmetric: `isBlockedEitherWay` for one pair, `blockedIdsFor` for filtering a list in memory, and `notBlockedWith(userId)` as a `where` on a related user (a gathering's host, a directory row) inside the same query, all in `@/lib/blocks`. A refusal never says "blocked": a friend request answers like a missing member, a picked invitee like one not found, an island like a closed one. `blockMember` deletes, in one transaction, the friendship either way, notifications between the two, and invitations (with their letters) to each other's gatherings that haven't ended. Where blocks apply today:

- `notify` writes nothing between a blocked pair, so every notify caller is covered.
- Friend requests, comments, and reactions (taking back an earlier reaction still works).
- Islands and mailboxes through `gateIsland`, and the gathering portal through `openableIds`, so presence on an island follows too.
- Gatherings: `gatheringAccess` returns null across a block; creating one refuses a picked blocked member and leaves a blocked community member out; the community calendar, the travel menu, and `/api/users?invitable=true` (the invitee picker) filter by the host.
- Presence: each stream's `hidden` set comes from `blockedIdsFor` when it opens, and the block routes call `presenceHub().setBlocked` so open streams update at once.

- Voice calls: starting or inviting refuses anyone in a block with the inviter, or with anyone in the call or invited; a token is refused across a block with anyone present; and the block route calls `separateInCalls`, so in a call holding both, the later arrival leaves and is disconnected.

Feeds, the plain directory, and community membership are deliberately not filtered (Luke, October 3, 2026).

## Voice calls

Friends-only group calls (Luke, October 3, 2026). LiveKit carries the audio; our rows decide who gets in. Everything goes through `@/lib/calls`, and everything LiveKit goes through `@/lib/livekit` (one module, so route tests mock one import). Proximity chat is not built.

- **Routes.** `POST /api/calls` starts one with up to 7 friends (`usernames`); the starter is in at once. `POST /api/calls/[id]/invites` adds more. `POST /api/calls/[id]/token` joins and returns `{ message, call_id, url, token, expires_at }`. `POST /api/calls/[id]/decline` and `/leave`. `GET /api/calls/current` returns `{ voice_enabled, call, invitations }` and is polled every ~10 seconds. Without `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`, start and token answer 503 and `voice_enabled` is false.
- **Who.** You start a call with your own friends. Anyone joined may invite their own friends, who needn't know anyone else there. Never anyone in a block with someone joined or invited. At most `MAX_CALL_SIZE` (8) people, counting open invitations. Ghosts can't start, join, or stay.
- **Presence is a heartbeat.** Joining sets `call_invites.seen_at`; each `GET /api/calls/current` from a present member moves it forward; a joined row unseen for `CALL_PRESENCE_STALE_MS` (45 seconds) isn't present. `presentWhere(now)` is the one definition. There are no webhooks, so this works on localhost. A member who left or went stale may rejoin while the call lasts; one who declined needs a new invitation. Invitations expire after `CALL_INVITE_TTL_MS` (10 minutes), checked at read time.
- **Ending.** The last one out ends the call and its LiveKit room is closed. A call whose members all went stale ends when anything settles it (a token request), and `pruneCalls` (run when a call starts) ends any that sat empty for a day.
- **Removal.** Turning Ghost Mode on and deleting an account call `leaveEveryCall`; a block calls `separateInCalls`. Both mark rows first, then ask LiveKit to disconnect the member after the commit. LiveKit failures are logged and never undo a row (`bestEffort`).
- **Locks.** A member's `users` row, then the `calls` row, always in that order, so joining can't race past the one-call-at-a-time rule or the size cap.
- **Tokens.** Identity is the user id, the room is the call id, microphone audio only, no data messages, `CALL_TOKEN_TTL_SECONDS` (10 minutes). The client asks again before it runs out.
- **Nothing is recorded.** No file may use LiveKit's recording (egress) API; `src/lib/livekit.test.ts` checks every source file.
- **Retention.** `pruneCalls` removes who was in a call (its invites, its `call_invite` notifications, the starter) `CALL_PEOPLE_RETENTION_DAYS` (30) after it ends, and the bare row after `CALL_ROW_RETENTION_DAYS`. `/admin/metrics` counts calls per week from the dates alone. The data export lists a member's own call rows by date and their own status, never who else was there.

## Polls

A poll post (`post_type: "poll"`) is created with its `polls` row and options in one nested `post.create` (`pollCreateData` in `@/lib/polls`), so one never exists without the other. Listings attach polls through `enrichPosts(posts, viewerId)` in `@/lib/post-helpers`, which every post-listing route calls in place of loading media alone. Per-option counts are withheld in the wire mapper (`toPollWire`) until the poll's `results_visible` rule allows them; the total always shows; who voted for what is never sent. `castVote` locks the voter's own row, then removes and adds exactly the vote rows it changes, so a single choice poll can't end with two votes and no count goes below zero. Votes notify nobody.

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
