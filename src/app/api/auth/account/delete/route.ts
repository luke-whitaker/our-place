import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { requireAuth, TRUSTED_DEVICE_COOKIE, TRUSTED_DEVICE_COOKIE_OPTIONS } from "@/lib/auth";
import { deleteAccountLimiter } from "@/lib/rate-limit";
import { deleteAccountSchema, getZodErrorMessage } from "@/lib/schemas";
import { forgetVisit } from "@/lib/activity";
import { presenceHub } from "@/lib/presence";
import { deleteAccount, deleteUploadedMedia } from "@/lib/account-deletion";
import { emailStillInvited } from "@/lib/gathering-emails";
import { leaveEveryCall } from "@/lib/calls";

// POST: delete the caller's own account, after checking their password. The
// member chooses whether their posts and comments go too ("remove_everything")
// or stay up as "A former member" ("leave_posts"). Admin accounts are Luke's
// and can't be deleted here. Every session ends: the row's password change
// revokes all tokens, and this response clears the cookies on this device.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const limit = deleteAccountLimiter.check(me);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const parsed = deleteAccountSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: me },
      select: { passwordHash: true, role: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    if (user.role === "admin") {
      return NextResponse.json(
        { error: "Admin accounts can't be deleted here. Ask Luke to do it." },
        { status: 403 },
      );
    }
    if (!(await bcrypt.compare(parsed.data.current_password, user.passwordHash))) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
    }

    // Out of any call first, so LiveKit drops them while the rows still say
    // where they were; deleteAccount then removes those rows.
    await leaveEveryCall(me, new Date());
    const { mediaKeys, cancelledGatheringIds } = await deleteAccount(me, parsed.data.mode);
    // The account is gone either way; these only tidy up after it. Guests of
    // a gathering it cancelled get the same email as any cancellation, one
    // gathering after another so the sends stay under the provider's rate.
    presenceHub().setGhost(me, true);
    forgetVisit(me);
    void (async () => {
      for (const id of cancelledGatheringIds) await emailStillInvited("cancelled", id);
    })();
    await deleteUploadedMedia(mediaKeys);

    const response = NextResponse.json({ message: "Your account is deleted. Take care." });
    response.cookies.set("auth_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 0,
      path: "/",
    });
    response.cookies.set(TRUSTED_DEVICE_COOKIE, "", {
      ...TRUSTED_DEVICE_COOKIE_OPTIONS,
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json({ error: "Failed to delete your account." }, { status: 500 });
  }
}
