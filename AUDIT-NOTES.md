# Our Place — Security & Quality Audit

**Date:** February 10, 2026
**Current score:** 7.2 / 10
**Status:** Solid MVP — architecture is sound, security fundamentals in place

---

## What Was Fixed (this session)

1. **Verification/reset codes removed from API responses** — now logged to server console in dev only
2. **JWT_SECRET required in production** — app crashes on startup if missing; dev gets a warning
3. **Rate limiting on all 5 auth endpoints** — login (10/15min), register (5/hr), verify (5/15min), forgot-password (3/15min), reset-password (5/15min)
4. **Verification code brute-force protection** — attempt tracking with code invalidation after 5 failures
5. **SELECT \* replaced in auth routes** — only needed columns selected; prevents leaking password_hash, codes, etc.
6. **User enumeration fixed** — login returns generic "Invalid email/username or password" for both cases
7. **crypto.randomInt()** replaces Math.random() for verification codes
8. **Content length limits** — posts capped at 50k chars, comments at 5k chars
9. **ON DELETE CASCADE** on all foreign keys — deleting a user/community cleans up related data
10. **Security headers** — X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-XSS-Protection
11. **Database indexes** added for users.email, users.username, comments.author_id, posts(community_id, created_at)
12. **React ErrorBoundary** — wraps entire app + page content separately; fallback UI with dev error details
13. **Empty catch blocks replaced** — errors now logged and surfaced to users in PostCard, feed, and community pages
14. **Token expiry reduced** from 7 days to 24 hours (cookies updated to match)
15. **Comment auth bug fixed** — profile posts (null community_id) no longer fail the membership check

---

## Next Steps (prioritized)

### High Priority

- [x] **Rate limit content creation routes** — posts, comments, reactions, communities, uploads, events now throttled via `RateLimiter` class.
- [ ] **Add Content-Security-Policy header** — the single most important missing defense against XSS. Add to `next.config.ts` security headers.
- [ ] **Add CSRF protection** — either switch cookies to `sameSite: 'strict'` or implement double-submit CSRF tokens via middleware.
- [x] **Add runtime input validation** — all API request bodies validated with Zod schemas.
- [x] **Add pagination** — all list endpoints use offset pagination via shared `parsePagination()` / `paginateResults()` helpers.

### Medium Priority

- [x] **Accessibility pass** — added `alt` text to images, `aria-label` to icon buttons, `role="alert"` on errors, `role="dialog"` + keyboard navigation on lightbox, `aria-expanded` on toggles, `aria-label` on nav.
- [x] **Database migration system** — now using Prisma migrations (`prisma migrate dev`).
- [ ] **Structured logging** — replace `console.error` with a logging library (Pino recommended for Next.js). Add request IDs for tracing.
- [x] **Fix `member_count` drift** — write operations (join/leave, reactions, comments) now wrapped in `$transaction` to prevent partial updates.
- [ ] **Replace remaining `SELECT *` queries** — community routes (`/api/communities/[id]`, join, leave) still select all fields.
- [x] **Validate reaction types** — reactions validated against `REACTION_TYPES` enum via Zod schema.

### Low Priority

- [ ] **Split large components** — `PostCard.tsx` and `CreatePostForm.tsx` into sub-components.
- [ ] **Extract shared utilities** — `timeAgo()` and avatar rendering are duplicated across files.
- [ ] **Add HSTS header** — `Strict-Transport-Security` for HTTPS enforcement.
- [ ] **Add API documentation** — OpenAPI/Swagger spec as the API grows.
- [ ] **Add `.env.example`** — document required environment variables.
- [ ] **Add loading skeletons** — replace spinner-only loading states with content-shaped placeholders.

---

## Architecture Notes

- **Stack:** Next.js 16 (App Router) + TypeScript + PostgreSQL (Prisma 7 ORM) + Tailwind CSS
- **Auth:** JWT in httpOnly cookies, bcrypt (12 rounds), admin-only account creation (invite-only model)
- **Rate limiting:** In-memory (`src/lib/rate-limit.ts`) — works for single-instance; swap to Redis for multi-instance
- **Database:** PostgreSQL via Prisma 7 — schema in `prisma/schema.prisma`, migrations in `prisma/migrations/`
- **Key lib files:** `src/lib/rate-limit.ts`, `src/lib/auth.ts` (requireAuth/requireAdmin helpers), `src/lib/post-helpers.ts` (validatePostContent, enrichPostsWithMedia), `src/components/ErrorBoundary.tsx`
