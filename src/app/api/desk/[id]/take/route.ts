import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { moveOwnItem, toPocketItem, isItemRaceError } from "@/lib/pockets";

// POST: take one of the caller's own desk items into their pockets. The move
// is guarded on the caller's own id and the "desk" location, so anyone else's
// item, or one already out of the desk, is simply not found.
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
    try {
      const result = await moveOwnItem(auth.user.userId, id, "desk", "pocket");
      if (result.outcome === "full") {
        return NextResponse.json(
          { error: "Your pockets are full. Make some room first." },
          { status: 409 },
        );
      }
      if (result.outcome !== "moved") {
        return NextResponse.json({ error: "Item not found." }, { status: 404 });
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
    console.error("Take from desk error:", error);
    return NextResponse.json({ error: "Failed to take that out of the desk." }, { status: 500 });
  }
}
