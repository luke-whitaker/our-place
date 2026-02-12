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

/** Login: 10 attempts per 15 minutes per IP */
export const loginLimiter = new RateLimiter({ maxAttempts: 10, windowMs: 15 * 60 * 1000 });

/** Registration: 5 attempts per hour per IP */
export const registerLimiter = new RateLimiter({ maxAttempts: 5, windowMs: 60 * 60 * 1000 });

/** Verification code submission: 5 attempts per 15 minutes per user */
export const verifyLimiter = new RateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });

/** Password reset request: 3 attempts per 15 minutes per IP */
export const forgotPasswordLimiter = new RateLimiter({ maxAttempts: 3, windowMs: 15 * 60 * 1000 });

/** Password reset submission: 5 attempts per 15 minutes per IP */
export const resetPasswordLimiter = new RateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });

/** Post creation: 20 per hour per user */
export const createPostLimiter = new RateLimiter({ maxAttempts: 20, windowMs: 60 * 60 * 1000 });

/** Comment creation: 30 per hour per user */
export const createCommentLimiter = new RateLimiter({ maxAttempts: 30, windowMs: 60 * 60 * 1000 });

/** Reactions: 60 per hour per user */
export const reactionLimiter = new RateLimiter({ maxAttempts: 60, windowMs: 60 * 60 * 1000 });

/** File uploads: 30 per hour per user */
export const uploadLimiter = new RateLimiter({ maxAttempts: 30, windowMs: 60 * 60 * 1000 });

/** Event creation: 10 per hour per user */
export const createEventLimiter = new RateLimiter({ maxAttempts: 10, windowMs: 60 * 60 * 1000 });

/** Community creation: 5 per hour per user */
export const createCommunityLimiter = new RateLimiter({ maxAttempts: 5, windowMs: 60 * 60 * 1000 });

/**
 * Extract a rate-limit key from a request.
 * Uses X-Forwarded-For header (for reverse proxies) or falls back to a default.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  // In development without a proxy, use a fallback
  return request.headers.get('x-real-ip') || 'unknown';
}
