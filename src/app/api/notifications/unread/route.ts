import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// GET: whether the caller has anything unread, for the navbar's dot. A yes or
// no on purpose: Our Place never shows a count.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const unread = await prisma.notification.findFirst({
      where: { recipientId: auth.user.userId, readAt: null },
      select: { id: true },
    });
    return NextResponse.json({ has_unread: unread !== null });
  } catch (error) {
    console.error("Unread notifications error:", error);
    return NextResponse.json({ error: "Failed to check notifications." }, { status: 500 });
  }
}
