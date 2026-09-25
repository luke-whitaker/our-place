import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { toPocketItem, ITEM_SELECT } from "@/lib/pockets";

// GET: the caller's own mailbox contents (items in the "mailbox" location),
// newest letter first. Only the owner can list what's in their mailbox.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const items = await prisma.item.findMany({
      where: { ownerId: auth.user.userId, location: "mailbox" },
      select: ITEM_SELECT,
      orderBy: { placedAt: "desc" },
    });

    return NextResponse.json({ letters: items.map(toPocketItem) });
  } catch (error) {
    console.error("Mailbox error:", error);
    return NextResponse.json({ error: "Failed to load your mailbox." }, { status: 500 });
  }
}
