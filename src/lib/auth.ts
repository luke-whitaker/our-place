import jwt from "jsonwebtoken";
import crypto from "crypto";
import { cookies } from "next/headers";
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
  return verifyToken(token);
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
