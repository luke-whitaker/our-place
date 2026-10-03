// The one server secret (JWT_SECRET) that signs sessions and every HMAC the
// site hands out: reset codes, trusted devices, unsubscribe links. In its own
// module so code that signs a link needn't import the session machinery.

const DEV_FALLBACK = "dev-only-insecure-fallback-change-me";

export function getServerSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production");
  }
  // Development-only fallback. NEVER used in production.
  console.warn("[AUTH] JWT_SECRET not set, using insecure development fallback");
  return DEV_FALLBACK;
}
