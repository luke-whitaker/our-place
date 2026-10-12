import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { getZodErrorMessage, wearHatSchema } from "@/lib/schemas";
import { isItemRaceError, toPocketItem } from "@/lib/pockets";
import { takeOffHat, wearItem, wornHat } from "@/lib/hats";
import { isPlantLook } from "@/lib/game/plants";
import { presenceHub } from "@/lib/presence";

function tooMany(retryAfterMs: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
  );
}

function pocketsChanged(): NextResponse {
  return NextResponse.json(
    { error: "Your pockets changed just then. Try again." },
    { status: 409 },
  );
}

// GET: the flower or keepsake on the caller's head, or null.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const hat = await wornHat(auth.user.userId);
    return NextResponse.json({ hat: hat ? toPocketItem(hat) : null });
  } catch (error) {
    console.error("Hat error:", error);
    return NextResponse.json({ error: "Failed to check your hat." }, { status: 500 });
  }
}

// POST: wear a flower or keepsake from pockets. Whatever was worn goes back
// into pockets. Everyone nearby sees the change through presence.
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;
    const limit = itemsLimiter.check(me);
    if (!limit.allowed) return tooMany(limit.retryAfterMs);

    const parsed = wearHatSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    const result = await wearItem(me, parsed.data.item_id);
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }
    if (result.outcome === "not_wearable") {
      return NextResponse.json(
        { error: "Only a flower or a keepsake mushroom can go on your head." },
        { status: 400 },
      );
    }
    if (result.outcome === "pockets_full") {
      return NextResponse.json(
        { error: "Make room in your pockets for what you're wearing now." },
        { status: 409 },
      );
    }
    presenceHub().setHat(me, isPlantLook(result.hat.color) ? result.hat.color : null);
    return NextResponse.json({ message: "You're wearing it.", hat: toPocketItem(result.hat) });
  } catch (error) {
    if (isItemRaceError(error)) return pocketsChanged();
    console.error("Wear hat error:", error);
    return NextResponse.json({ error: "Failed to put that on." }, { status: 500 });
  }
}

// DELETE: take the worn hat off, back into pockets.
export async function DELETE() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;
    const limit = itemsLimiter.check(me);
    if (!limit.allowed) return tooMany(limit.retryAfterMs);

    const outcome = await takeOffHat(me);
    if (outcome === "nothing_worn") {
      return NextResponse.json({ error: "You aren't wearing anything." }, { status: 409 });
    }
    if (outcome === "pockets_full") {
      return NextResponse.json({ error: "Make room in your pockets first." }, { status: 409 });
    }
    presenceHub().setHat(me, null);
    return NextResponse.json({ message: "Back in your pockets." });
  } catch (error) {
    if (isItemRaceError(error)) return pocketsChanged();
    console.error("Take off hat error:", error);
    return NextResponse.json({ error: "Failed to take that off." }, { status: 500 });
  }
}
