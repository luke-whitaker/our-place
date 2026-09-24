import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { isNpcId, NPC_GIFTS } from "@/lib/npcs";
import { firstFreeSlot, toPocketItem, isUniqueConstraintError } from "@/lib/pockets";

// POST: talk to an NPC. gift/after/pockets_full/chat are dialogue branches
// the world client renders, not error states, so they're all 200 — the only
// real error is an npc id nothing answers to.
export async function POST(_request: Request, { params }: { params: Promise<{ npc: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const limit = itemsLimiter.check(auth.user.userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const { npc } = await params;
    if (!isNpcId(npc)) {
      return NextResponse.json({ error: "There's no one there by that name." }, { status: 404 });
    }

    const gift = NPC_GIFTS[npc];
    if (!gift) {
      return NextResponse.json({ state: "chat" });
    }

    const alreadyGiven = await prisma.npcGift.findUnique({
      where: { userId_giftId: { userId: auth.user.userId, giftId: gift.giftId } },
      select: { userId: true },
    });
    if (alreadyGiven) {
      return NextResponse.json({ state: "after" });
    }

    try {
      // The gift row's natural key (user, giftId) is what actually stops a
      // double gift under concurrency; the findUnique above is just the
      // common-case fast path. A P2002 here means a concurrent talk already
      // won that race, so it's read the same as "after" rather than a 500.
      const created = await prisma.$transaction(async (tx) => {
        const slot = await firstFreeSlot(tx, auth.user.userId);
        if (slot === null) return null;

        await tx.npcGift.create({ data: { userId: auth.user.userId, giftId: gift.giftId } });
        return tx.item.create({
          data: { id: uuidv4(), ownerId: auth.user.userId, kind: gift.kind, slot },
          select: { id: true, kind: true, slot: true, body: true },
        });
      });

      if (!created) {
        return NextResponse.json({ state: "pockets_full" });
      }
      return NextResponse.json({ state: "gift", item: toPocketItem(created) });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return NextResponse.json({ state: "after" });
      }
      throw error;
    }
  } catch (error) {
    console.error("NPC talk error:", error);
    return NextResponse.json({ error: "Failed to talk to them." }, { status: 500 });
  }
}
