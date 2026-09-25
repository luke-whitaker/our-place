import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { toPocketItem, ITEM_SELECT } from "@/lib/pockets";

// GET: the caller's pocket contents (items in the "pocket" location), in
// slot order. Mailbox letters never appear here, even before they're taken.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const items = await prisma.item.findMany({
      where: { ownerId: auth.user.userId, location: "pocket" },
      select: ITEM_SELECT,
      orderBy: { slot: "asc" },
    });

    return NextResponse.json({ items: items.map(toPocketItem) });
  } catch (error) {
    console.error("Pockets error:", error);
    return NextResponse.json({ error: "Failed to load your pockets." }, { status: 500 });
  }
}
