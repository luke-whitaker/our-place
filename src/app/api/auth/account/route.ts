import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { updateAccountLimiter } from "@/lib/rate-limit";
import { updateAccountSchema, getZodErrorMessage } from "@/lib/schemas";

// PATCH: Update the current user's account (email, phone, password).
// Changing the password requires the current password.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const limit = updateAccountLimiter.check(auth.user.userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many account changes. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await request.json();
    const parsed = updateAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const { email, phone, current_password, new_password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: auth.user.userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const data: { email?: string; phone?: string; passwordHash?: string } = {};

    if (new_password) {
      const validPassword = await bcrypt.compare(current_password ?? "", user.passwordHash);
      if (!validPassword) {
        return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
      }
      data.passwordHash = await bcrypt.hash(new_password, 12);
    }

    if (email) {
      const normalized = email.trim().toLowerCase();
      const taken = await prisma.user.findFirst({
        where: { email: normalized, NOT: { id: user.id } },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
      }
      data.email = normalized;
    }

    if (phone) {
      const normalized = phone.trim();
      const taken = await prisma.user.findFirst({
        where: { phone: normalized, NOT: { id: user.id } },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json(
          { error: "That phone number is already in use." },
          { status: 409 },
        );
      }
      data.phone = normalized;
    }

    await prisma.user.update({ where: { id: user.id }, data });

    return NextResponse.json({ message: "Account updated." });
  } catch (error) {
    console.error("Account update error:", error);
    return NextResponse.json({ error: "Failed to update account." }, { status: 500 });
  }
}
