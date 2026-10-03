import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { ITEM_CATALOG, isItemKind, type ItemLocation } from "@/lib/items";
import { takeOne } from "@/lib/pockets";

// DELETE: throw away one of the caller's own items, wherever it sits —
// pockets or their own mailbox. A stack loses one at a time. The Notebook can never be thrown away; an
// Event Mushroom only once its gathering is cancelled or gone.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        id: true,
        ownerId: true,
        kind: true,
        location: true,
        gathering: { select: { status: true } },
      },
    });
    if (!item || item.ownerId !== auth.user.userId) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    if (item.location === "head") {
      return NextResponse.json({ error: "Take it off first." }, { status: 409 });
    }

    // A row's kind always comes from our own catalog — an unrecognized value
    // means the database and the catalog have drifted, which the outer catch
    // turns into a 500 rather than silently treating it as discardable.
    if (!isItemKind(item.kind)) {
      throw new Error(`Unknown item kind "${item.kind}" on item ${item.id}`);
    }
    const catalogEntry = ITEM_CATALOG[item.kind];
    // An Event Mushroom whose gathering is gone (its community was deleted)
    // or cancelled has nothing left to plant, so it may go like a note.
    const spentMushroom = item.kind === "event_mushroom" && item.gathering?.status !== "scheduled";
    if (!catalogEntry.discardable && !spentMushroom) {
      return NextResponse.json(
        { error: `The ${catalogEntry.name} can't be thrown away.` },
        { status: 403 },
      );
    }

    const location = item.location as ItemLocation;
    const thrown = await prisma.$transaction((tx) => takeOne(tx, auth.user.userId, id, location));
    if (!thrown) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    return NextResponse.json({ message: "Thrown away." });
  } catch (error) {
    console.error("Discard item error:", error);
    return NextResponse.json({ error: "Failed to throw that away." }, { status: 500 });
  }
}
