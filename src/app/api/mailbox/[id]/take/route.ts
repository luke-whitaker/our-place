import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { moveOwnItem, toPocketItem, isItemRaceError } from "@/lib/pockets";

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
      const result = await moveOwnItem(auth.user.userId, letter.id, "mailbox", "pocket");
      if (result.outcome === "full") {
        return NextResponse.json(
          { error: "Your pockets are full. Make some room, then come back for it." },
          { status: 409 },
        );
      }
      if (result.outcome !== "moved") {
        return NextResponse.json({ error: "Letter not found." }, { status: 404 });
      }

      return NextResponse.json({ message: "Taken.", item: toPocketItem(result.item) });
    } catch (error) {
      if (isItemRaceError(error)) {
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
