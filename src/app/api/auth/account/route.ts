import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { requireAuth, signToken, AUTH_COOKIE_OPTIONS } from "@/lib/auth";
import { updateAccountLimiter } from "@/lib/rate-limit";
import { sendEmailChangedNotice } from "@/lib/email";
import { forgetVisit } from "@/lib/activity";
import {
  updateAccountSchema,
  getZodErrorMessage,
  needsCurrentPassword,
  normalizePhone,
} from "@/lib/schemas";

// PATCH: Update the current user's account (name, email, phone, password, and
// whether they're left out of the activity counts).
// Changing the email, phone, or password requires the current password, so a
// session alone can't take over the account through the email reset flow.
// An email change is announced to the old address.
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
    const {
      display_name,
      email,
      phone,
      theme,
      biome,
      mailbox_color,
      island_visibility,
      exclude_from_metrics,
      current_password,
      new_password,
    } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: auth.user.userId },
      select: { id: true, email: true, passwordHash: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    // Checked before anything else touches sign-in details, so a session
    // without the password can't even learn whether an email is taken.
    if (needsCurrentPassword(parsed.data)) {
      const validPassword = await bcrypt.compare(current_password ?? "", user.passwordHash);
      if (!validPassword) {
        return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
      }
    }

    const data: {
      displayName?: string;
      email?: string;
      phone?: string | null;
      theme?: string;
      biome?: string;
      mailboxColor?: string;
      islandVisibility?: string;
      excludeFromMetrics?: boolean;
      passwordHash?: string;
      passwordChangedAt?: Date;
    } = {};

    if (display_name) {
      data.displayName = display_name;
    }

    if (theme) {
      data.theme = theme;
    }

    if (biome) {
      data.biome = biome;
    }

    if (mailbox_color) {
      data.mailboxColor = mailbox_color;
    }

    if (island_visibility) {
      data.islandVisibility = island_visibility;
    }

    if (exclude_from_metrics !== undefined) {
      data.excludeFromMetrics = exclude_from_metrics;
    }

    if (new_password) {
      data.passwordHash = await bcrypt.hash(new_password, 12);
      // Revokes every existing session: getAuthUser rejects tokens issued
      // before this timestamp.
      data.passwordChangedAt = new Date();
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

    if (phone !== undefined) {
      // Digits-only storage keeps the unique constraint honest; null clears it.
      const normalized = normalizePhone(phone);
      if (normalized) {
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
      }
      data.phone = normalized;
    }

    // Leaving the activity counts also deletes the member's existing rows, in
    // the same transaction, so opting out removes what was already counted.
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data }),
      ...(exclude_from_metrics
        ? [prisma.activityDay.deleteMany({ where: { userId: user.id } })]
        : []),
    ]);
    if (exclude_from_metrics) forgetVisit(user.id);

    if (data.email && data.email !== user.email) {
      // The change is already saved; a failed notice is logged, not returned,
      // so the member isn't told their update failed when it didn't.
      try {
        await sendEmailChangedNotice(user.email, data.email);
      } catch (err) {
        console.error("Failed to send email-change notice:", err);
      }
    }

    const response = NextResponse.json({ message: "Account updated." });

    if (new_password) {
      // The change revoked every session, including this one — re-issue a
      // fresh token so the device that changed the password stays signed in.
      const token = signToken({
        userId: auth.user.userId,
        username: auth.user.username,
        is_verified: auth.user.is_verified,
        role: auth.user.role,
      });
      response.cookies.set("auth_token", token, AUTH_COOKIE_OPTIONS);
    }

    return response;
  } catch (error) {
    console.error("Account update error:", error);
    return NextResponse.json({ error: "Failed to update account." }, { status: 500 });
  }
}
