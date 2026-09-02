import jwt from "jsonwebtoken";
import crypto from "crypto";
import { cookies } from "next/headers";
import prisma from "./db";
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

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
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
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
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
    select: { passwordChangedAt: true, role: true },
  });
  if (!user) return null;
  if (tokenIssuedBeforePasswordChange(payload.iat, user.passwordChangedAt)) return null;

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
