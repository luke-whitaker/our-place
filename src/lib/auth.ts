import jwt from "jsonwebtoken";
import crypto from "crypto";
import { cookies } from "next/headers";
import prisma from "./db";
import { recordVisit } from "./activity";
import { AuthPayload } from "./types";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET environment variable is required in production");
    }
    // Development-only fallback — NEVER use in production
    console.warn("[AUTH] JWT_SECRET not set — using insecure development fallback");
    return "dev-only-insecure-fallback-change-me";
  }
  return secret;
}

const JWT_SECRET = getJwtSecret();

// Pinned on both sides, so a token never gets to choose how it is checked.
const JWT_ALGORITHM = "HS256";

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: "24h" });
}

/**
 * Cookie options for the auth token — shared by every route that sets it
 * (login, password change) so the security attributes can't drift apart.
 */
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 24 * 60 * 60, // 24 hours
  path: "/",
} as const;

/**
 * A token is revoked if it was issued before the user's last password change.
 * Both sides compare at whole-second precision (JWT iat has second
 * resolution), so the fresh token re-issued in the same second as the change
 * survives while every earlier session dies.
 */
export function tokenIssuedBeforePasswordChange(
  iatSeconds: number | undefined,
  passwordChangedAt: Date | null,
): boolean {
  if (!passwordChangedAt) return false;
  // A verified token without iat can't prove it postdates the change — treat
  // it as revoked (signToken always produces one, so this shouldn't happen).
  if (iatSeconds === undefined) return true;
  return iatSeconds < Math.floor(passwordChangedAt.getTime() / 1000);
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] }) as AuthPayload;
  } catch {
    return null;
  }
}

export async function getAuthUser(): Promise<AuthPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;

  // The signature checks out, but the token may have been revoked: password
  // changes stamp passwordChangedAt, and any token issued before it is dead.
  // The lookup also kills tokens of since-deleted accounts.
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      username: true,
      excludeFromMetrics: true,
      passwordChangedAt: true,
      role: true,
    },
  });
  if (!user) return null;
  if (tokenIssuedBeforePasswordChange(payload.iat, user.passwordChangedAt)) return null;

  // Every signed-in page and route passes through here, so this is where a
  // day counts as active. At most one write per member per day, and never
  // awaited: a metrics failure is logged and must not fail the request.
  void recordVisit(user);

  // role comes from the database, not the token: the token is valid for 24h,
  // and a promotion or demotion during that window must take effect on the
  // very next request rather than waiting for the token to expire and reissue.
  return { ...payload, role: user.role };
}

export async function requireAuth(): Promise<
  { user: AuthPayload; error?: never } | { user?: never; error: Response }
> {
  const auth = await getAuthUser();
  if (!auth) {
    const { NextResponse } = await import("next/server");
    return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  }
  return { user: auth };
}

export async function requireAdmin(): Promise<
  { user: AuthPayload; error?: never } | { user?: never; error: Response }
> {
  const result = await requireAuth();
  if (result.error) return result;
  if (result.user.role !== "admin") {
    const { NextResponse } = await import("next/server");
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 403 }) };
  }
  return result;
}

export function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/** Wrong reset-code guesses allowed before the code is wiped. */
export const RESET_CODE_MAX_ATTEMPTS = 5;

/**
 * What the database stores for a reset code. Six digits are a million guesses,
 * so a plain hash of a leaked row would fall in a second; keyed with the server
 * secret, a database copy alone reveals nothing.
 */
export function hashResetCode(code: string): string {
  return crypto.createHmac("sha256", JWT_SECRET).update(code).digest("hex");
}

/** The cookie marking a browser its member has signed in from before. */
export const TRUSTED_DEVICE_COOKIE = "trusted_device";

/** Lives a year and travels only to the login route, the one place that reads it. */
export const TRUSTED_DEVICE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 365 * 24 * 60 * 60,
  path: "/api/auth/login",
} as const;

function trustedDeviceMac(userId: string, issuedAtSeconds: string): string {
  return crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`trusted-device:${userId}:${issuedAtSeconds}`)
    .digest("hex");
}

/** `userId.issuedAt.mac`, set on every successful sign-in. */
export function signTrustedDevice(userId: string): string {
  const issuedAtSeconds = String(Math.floor(Date.now() / 1000));
  return `${userId}.${issuedAtSeconds}.${trustedDeviceMac(userId, issuedAtSeconds)}`;
}

/**
 * Whether this browser signed in to this account before. A password change
 * revokes the trust along with every session, so a reset after a break-in also
 * forgets the intruder's browser.
 */
export function isTrustedDevice(
  cookie: string | undefined,
  userId: string,
  passwordChangedAt: Date | null,
): boolean {
  const [cookieUserId, issuedAtSeconds, mac] = cookie?.split(".") ?? [];
  if (cookieUserId !== userId || !/^\d+$/.test(issuedAtSeconds ?? "") || !mac) return false;
  if (!constantTimeEqual(mac, trustedDeviceMac(userId, issuedAtSeconds))) return false;
  return !tokenIssuedBeforePasswordChange(Number(issuedAtSeconds), passwordChangedAt);
}

/**
 * Constant-time comparison for short secrets (reset codes), so a partial match
 * can't be inferred from response timing. Returns false on length mismatch
 * rather than letting timingSafeEqual throw.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
