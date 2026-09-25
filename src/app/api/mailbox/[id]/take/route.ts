import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { firstFreeSlot, toPocketItem, isUniqueConstraintError, ITEM_SELECT } from "@/lib/pockets";

type TakeOutcome =
  | { outcome: "taken"; item: Prisma.ItemGetPayload<{ select: typeof ITEM_SELECT }> }
  | { outcome: "pockets_full" }
  | { outcome: "letter_gone" };

// POST: take one of the caller's own mailbox letters into their pockets.
// `from` and `placed_at` come along for the ride, so the reader still shows
// who sent it and when even after it's in a pocket.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params;
    const letter = await prisma.item.findUnique({
      where: { id },
      select: { id: true, ownerId: true, location: true },
    });
    if (!letter || letter.ownerId !== auth.user.userId || letter.location !== "mailbox") {
      return NextResponse.json({ error: "Letter not found." }, { status: 404 });
    }

    try {
      const result = await prisma.$transaction(async (tx): Promise<TakeOutcome> => {
        const slot = await firstFreeSlot(tx, auth.user.userId, "pocket");
        if (slot === null) return { outcome: "pockets_full" };

        // Guarded write: only moves the letter if it's still in the
        // caller's mailbox, so a concurrent double-take can't move it
        // twice. The unique slot constraint (caught below as P2002) is what
        // actually stops two concurrent takes claiming the same pocket slot.
        const moved = await tx.item.updateMany({
          where: { id: letter.id, ownerId: auth.user.userId, location: "mailbox" },
          data: { location: "pocket", slot },
        });
        if (moved.count !== 1) return { outcome: "letter_gone" };

        const item = await tx.item.findUniqueOrThrow({
          where: { id: letter.id },
          select: ITEM_SELECT,
        });
        return { outcome: "taken", item };
      });

      if (result.outcome === "pockets_full") {
        return NextResponse.json(
          { error: "Your pockets are full. Make some room, then come back for it." },
          { status: 409 },
        );
      }
      if (result.outcome === "letter_gone") {
        return NextResponse.json({ error: "Letter not found." }, { status: 404 });
      }

      return NextResponse.json({ message: "Taken.", item: toPocketItem(result.item) });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return NextResponse.json(
          { error: "Your pockets changed just then. Try again." },
          { status: 409 },
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Take letter error:", error);
    return NextResponse.json({ error: "Failed to take that letter." }, { status: 500 });
  }
}
