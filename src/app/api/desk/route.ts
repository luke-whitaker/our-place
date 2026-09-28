import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { deskStoreSchema, getZodErrorMessage } from "@/lib/schemas";
import { ITEM_SELECT, isUniqueConstraintError, moveOwnItem, toPocketItem } from "@/lib/pockets";

// The house desk belongs to the signed-in member alone. Neither handler takes
// a username: every query is scoped to the caller's own items, so a visitor
// can never reach anyone else's desk by construction.

// GET: the caller's desk contents, in slot order.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const items = await prisma.item.findMany({
      where: { ownerId: auth.user.userId, location: "desk" },
      select: ITEM_SELECT,
      orderBy: { slot: "asc" },
    });

    return NextResponse.json({ items: items.map(toPocketItem) });
  } catch (error) {
    console.error("Desk error:", error);
    return NextResponse.json({ error: "Failed to load your desk." }, { status: 500 });
  }
}

// POST: put one of the caller's pocket items in their desk, in the chosen
// slot or the lowest free one. Anything that fits in pockets fits here.
export async function POST(request: Request) {
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

    const parsed = deskStoreSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    try {
      const { item_id, slot } = parsed.data;
      const result = await moveOwnItem(auth.user.userId, item_id, "pocket", "desk", slot);
      if (result.outcome === "full") {
        return NextResponse.json({ error: "Your desk is full." }, { status: 409 });
      }
      if (result.outcome === "slot_taken") {
        return NextResponse.json(
          { error: "Something's already in that spot. Pick an empty one." },
          { status: 409 },
        );
      }
      if (result.outcome === "gone") {
        return NextResponse.json({ error: "Item not found." }, { status: 404 });
      }

      return NextResponse.json({ message: "Put away.", item: toPocketItem(result.item) });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return NextResponse.json(
          { error: "Your desk changed just then. Try again." },
          { status: 409 },
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Desk store error:", error);
    return NextResponse.json({ error: "Failed to put that away." }, { status: 500 });
  }
}
