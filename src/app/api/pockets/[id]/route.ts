import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { ITEM_CATALOG, isItemKind } from "@/lib/items";

// DELETE: throw away one of the caller's own pocket items. The Notebook is
// the only catalog entry marked non-discardable, and it can never be thrown
// away.
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
      select: { id: true, ownerId: true, kind: true },
    });
    if (!item || item.ownerId !== auth.user.userId) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    // A row's kind always comes from our own catalog — an unrecognized value
    // means the database and the catalog have drifted, which the outer catch
    // turns into a 500 rather than silently treating it as discardable.
    if (!isItemKind(item.kind)) {
      throw new Error(`Unknown item kind "${item.kind}" on item ${item.id}`);
    }
    const catalogEntry = ITEM_CATALOG[item.kind];
    if (!catalogEntry.discardable) {
      return NextResponse.json(
        { error: `The ${catalogEntry.name} can't be thrown away.` },
        { status: 403 },
      );
    }

    await prisma.item.delete({ where: { id } });

    return NextResponse.json({ message: "Thrown away." });
  } catch (error) {
    console.error("Discard item error:", error);
    return NextResponse.json({ error: "Failed to throw that away." }, { status: 500 });
  }
}
