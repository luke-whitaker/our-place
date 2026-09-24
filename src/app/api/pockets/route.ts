import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { toPocketItem } from "@/lib/pockets";

// GET: the caller's pocket contents (items holding a slot), in slot order.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const items = await prisma.item.findMany({
      where: { ownerId: auth.user.userId, slot: { not: null } },
      select: { id: true, kind: true, slot: true, body: true },
      orderBy: { slot: "asc" },
    });

    return NextResponse.json({ items: items.map(toPocketItem) });
  } catch (error) {
    console.error("Pockets error:", error);
    return NextResponse.json({ error: "Failed to load your pockets." }, { status: 500 });
  }
}
