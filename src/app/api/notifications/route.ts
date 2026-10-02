import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  groupNotifications,
  NOTIFICATION_RETENTION_DAYS,
  NOTIFICATIONS_SHOWN,
} from "@/lib/notifications";
import { cancelUnplanted } from "@/lib/gathering-sweep";

const DAY_MS = 24 * 60 * 60 * 1000;

// GET: the caller's notifications, newest first, with reactions grouped per
// post. Reading never marks anything read; the page does that with POST
// /api/notifications/read once it has shown them. Rows past the retention
// window are pruned here, so the table stays bounded without a scheduled job.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * DAY_MS);
    await prisma.notification.deleteMany({ where: { recipientId: me, createdAt: { lt: cutoff } } });
    // A world gathering that started unplanted is settled before reading, so
    // its cancellation shows here without waiting for the background sweep.
    await cancelUnplanted();

    const rows = await prisma.notification.findMany({
      where: { recipientId: me },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATIONS_SHOWN,
      select: {
        id: true,
        kind: true,
        createdAt: true,
        readAt: true,
        friendshipId: true,
        actor: { select: { username: true, displayName: true } },
        post: { select: { id: true, title: true, community: { select: { slug: true } } } },
        comment: { select: { content: true } },
        gathering: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            status: true,
            invites: { where: { userId: me }, select: { status: true } },
          },
        },
      },
    });

    return NextResponse.json({ notifications: groupNotifications(rows) });
  } catch (error) {
    console.error("Notifications error:", error);
    return NextResponse.json({ error: "Failed to load notifications." }, { status: 500 });
  }
}
