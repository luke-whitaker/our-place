/**
 * Simple in-memory rate limiter for API routes.
 *
 * For production at scale, replace with Redis-backed rate limiting.
 * This implementation is sufficient for single-instance deployments.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  /** Maximum number of requests allowed within the window */
  maxAttempts: number;
  /** Time window in milliseconds */
  windowMs: number;
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(options: RateLimiterOptions) {
    this.maxAttempts = options.maxAttempts;
    this.windowMs = options.windowMs;

    // Periodically clean up expired entries to prevent memory leaks
    setInterval(() => this.cleanup(), 60_000);
  }

  /**
   * Check if a key is rate-limited. Returns the number of remaining attempts,
   * or -1 if the key is blocked.
   */
  check(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    // No existing entry or window expired — allow and start fresh
    if (!entry || now > entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.maxAttempts - 1, retryAfterMs: 0 };
    }

    // Within window and under limit
    if (entry.count < this.maxAttempts) {
      entry.count++;
      return { allowed: true, remaining: this.maxAttempts - entry.count, retryAfterMs: 0 };
    }

    // Rate limited
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
  }

  /** Reads a key's state without spending an attempt, for limiters that count failures only. */
  peek(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry || now > entry.resetAt || entry.count < this.maxAttempts) {
      return { allowed: true, retryAfterMs: 0 };
    }
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  /** Spends one attempt without asking whether it was allowed; pairs with peek. */
  recordFailure(key: string): void {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry || now > entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    entry.count = Math.min(entry.count + 1, this.maxAttempts);
  }

  /** Remove expired entries */
  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.resetAt) {
        this.store.delete(key);
      }
    }
  }
}

// ── Pre-configured limiters ──

/** Login: 10 failed attempts per 15 minutes per IP; trusted browsers skip it (see the login route). */
export const loginLimiter = new RateLimiter({ maxAttempts: 10, windowMs: 15 * 60 * 1000 });

/**
 * Login per account: 10 failed attempts per hour per member. IPv6 hands an
 * attacker an endless supply of addresses, so the per-IP limit alone can't stop
 * a slow password guess against one member. Only failures count, and a browser
 * the member has signed in from before skips it (see isTrustedDevice), so a
 * stranger who knows a username can't lock its owner out.
 */
export const accountLoginLimiter = new RateLimiter({ maxAttempts: 10, windowMs: 60 * 60 * 1000 });

/** Password reset request: 3 attempts per 15 minutes per IP */
export const forgotPasswordLimiter = new RateLimiter({ maxAttempts: 3, windowMs: 15 * 60 * 1000 });

/** Password reset submission: 5 attempts per 15 minutes per IP */
export const resetPasswordLimiter = new RateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });

/** Account updates (email/phone/password): 5 per 15 minutes per user */
export const updateAccountLimiter = new RateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });

/** "Download my data": 5 an hour per member; each one reads their whole history. */
export const exportAccountLimiter = new RateLimiter({ maxAttempts: 5, windowMs: 60 * 60 * 1000 });

/** Account deletion attempts (each checks the password): 5 per 15 minutes per member. */
export const deleteAccountLimiter = new RateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });

/** Post creation: 20 per hour per user */
export const createPostLimiter = new RateLimiter({ maxAttempts: 20, windowMs: 60 * 60 * 1000 });

/** Comment creation: 30 per hour per user */
export const createCommentLimiter = new RateLimiter({ maxAttempts: 30, windowMs: 60 * 60 * 1000 });

/** Reactions: 60 per hour per user */
export const reactionLimiter = new RateLimiter({ maxAttempts: 60, windowMs: 60 * 60 * 1000 });

/** Poll votes: 120 per hour per user (switching and taking a vote back count too) */
export const pollVoteLimiter = new RateLimiter({ maxAttempts: 120, windowMs: 60 * 60 * 1000 });

/** File uploads: 30 per hour per user */
export const uploadLimiter = new RateLimiter({ maxAttempts: 30, windowMs: 60 * 60 * 1000 });

/** Community creation: 5 per hour per user */
export const createCommunityLimiter = new RateLimiter({ maxAttempts: 5, windowMs: 60 * 60 * 1000 });

/** Friend requests: 20 per hour per user */
export const friendRequestLimiter = new RateLimiter({ maxAttempts: 20, windowMs: 60 * 60 * 1000 });

/** Blocking and unblocking: 30 per hour per user */
export const blockLimiter = new RateLimiter({ maxAttempts: 30, windowMs: 60 * 60 * 1000 });

/** Hosting a gathering: 10 per hour per user (each one can write hundreds of invitations) */
export const createGatheringLimiter = new RateLimiter({
  maxAttempts: 10,
  windowMs: 60 * 60 * 1000,
});

/** Answering or cancelling gatherings: 60 per hour per user */
export const gatheringResponseLimiter = new RateLimiter({
  maxAttempts: 60,
  windowMs: 60 * 60 * 1000,
});

/** Pocket/Notebook/NPC-talk mutations: 120 per hour per user */
export const itemsLimiter = new RateLimiter({ maxAttempts: 120, windowMs: 60 * 60 * 1000 });

/** Map discoveries: 60 per minute per user. The client saves at most once
 * every few seconds while exploring, plus once per shrine and on leaving. */
export const discoveriesLimiter = new RateLimiter({ maxAttempts: 60, windowMs: 60 * 1000 });

/**
 * Number of trusted reverse proxies in front of the app. Railway's edge is a
 * single hop, so 1 is correct in production; override via env if the topology
 * changes (e.g. adding a CDN in front). Always at least 1.
 */
const TRUSTED_PROXY_HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);

/**
 * Extract a client IP for rate-limiting, resistant to X-Forwarded-For spoofing.
 *
 * X-Forwarded-For is a client→proxy chain: each hop *appends* the IP it saw, so
 * the leftmost entry is fully client-controlled and trivially forged (the old
 * code read it, so rotating the header defeated every limiter). We instead trust
 * only the entry our own infrastructure appended — `TRUSTED_PROXY_HOPS` from the
 * right. A client injecting extra XFF values only pushes its forgeries further
 * left, past the hop we read. Falls back to x-real-ip, then a shared constant.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts[Math.max(0, parts.length - TRUSTED_PROXY_HOPS)];
    }
  }
  return request.headers.get("x-real-ip") || "unknown";
}

/** Presence positions: the client sends up to ~7 a second while walking plus a
 * keepalive every 10 s, so 900 a minute per user leaves headroom. */
export const presenceMoveLimiter = new RateLimiter({ maxAttempts: 900, windowMs: 60 * 1000 });

/** Presence emotes: 30 per minute per user */
export const presenceEmoteLimiter = new RateLimiter({ maxAttempts: 30, windowMs: 60 * 1000 });

/** Presence streams opened: 60 per minute per user (reconnects included) */
export const presenceStreamLimiter = new RateLimiter({ maxAttempts: 60, windowMs: 60 * 1000 });

/** Armoire changes (save, edit, delete, wear, Ghost Mode): 60 per minute per user */
export const armoireLimiter = new RateLimiter({ maxAttempts: 60, windowMs: 60 * 1000 });
