import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { getZodErrorMessage, wearHatSchema } from "@/lib/schemas";
import { isUniqueConstraintError, toPocketItem } from "@/lib/pockets";
import { takeOffHat, wearFlower, wornHat } from "@/lib/hats";
import { isFlowerColor } from "@/lib/game/plants";
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

// GET: the flower on the caller's head, or null.
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

// POST: wear a flower from pockets. A flower already worn swaps into the slot
// the new one leaves. Everyone nearby sees the change through presence.
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

    const result = await wearFlower(me, parsed.data.item_id);
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }
    if (result.outcome === "not_flower") {
      return NextResponse.json({ error: "Only a flower can go on your head." }, { status: 400 });
    }
    presenceHub().setHat(me, isFlowerColor(result.hat.color) ? result.hat.color : null);
    return NextResponse.json({ message: "You're wearing it.", hat: toPocketItem(result.hat) });
  } catch (error) {
    if (isUniqueConstraintError(error)) return pocketsChanged();
    console.error("Wear hat error:", error);
    return NextResponse.json({ error: "Failed to put that on." }, { status: 500 });
  }
}

// DELETE: take the worn flower off, back into pockets.
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
    if (isUniqueConstraintError(error)) return pocketsChanged();
    console.error("Take off hat error:", error);
    return NextResponse.json({ error: "Failed to take that off." }, { status: 500 });
  }
}
