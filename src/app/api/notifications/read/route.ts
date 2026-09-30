import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// POST: mark every one of the caller's notifications read. The Notifications
// page calls this after showing them, which is what clears the navbar's dot.
// Idempotent and touches only the caller's own rows.
export async function POST() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { count } = await prisma.notification.updateMany({
      where: { recipientId: auth.user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ message: "Marked read.", marked: count });
  } catch (error) {
    console.error("Mark notifications read error:", error);
    return NextResponse.json({ error: "Failed to mark notifications read." }, { status: 500 });
  }
}
