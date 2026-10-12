import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { gatheringAccess } from "@/lib/gatherings";
import { giveKeepsake } from "@/lib/keepsakes";
import { isItemRaceError, toPocketItem } from "@/lib/pockets";

function refuse(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

// POST: a guest who came near this gathering's Event Mushroom takes home its
// Keepsake Mushroom, once. The world client asks when it sees them within
// KEEPSAKE_REACH_TILES; the server takes its word on where they stand, since
// a keepsake is a souvenir and anyone who may ask may also walk there. It
// checks everything else: the gathering is one they may open, and its
// mushroom is standing right now.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const limit = itemsLimiter.check(me);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const { id } = await params;
    const access = await gatheringAccess(id, me);
    if (!access) return refuse("Gathering not found.", 404);
    const g = access.gathering;
    const standing =
      g.kind === "world" &&
      g.status === "scheduled" &&
      g.plantedAt !== null &&
      g.endsAt.getTime() > Date.now();
    if (!standing) return refuse("That gathering's mushroom isn't standing right now.", 409);

    const result = await prisma.$transaction((tx) => giveKeepsake(tx, id, me));
    if (result.outcome === "pockets_full") {
      return refuse(
        "Your pockets are full. Make room, then come back to the mushroom for your keepsake.",
        409,
      );
    }
    if (result.outcome === "already") {
      return NextResponse.json({ message: "You already have this gathering's keepsake." });
    }
    return NextResponse.json({
      message: "You found a keepsake mushroom! It's in your pockets.",
      item: toPocketItem(result.item),
    });
  } catch (error) {
    if (isItemRaceError(error)) return refuse("Your pockets changed just then. Try again.", 409);
    console.error("Keepsake error:", error);
    return refuse("Failed to give you a keepsake.", 500);
  }
}
