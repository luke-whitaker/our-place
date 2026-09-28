import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { createOutfitSchema, getZodErrorMessage } from "@/lib/schemas";
import { isUniqueConstraintError } from "@/lib/pockets";
import { armoireRateLimited, OUTFIT_SELECT, toOutfit, wearingOf } from "@/lib/outfits";
import { MAX_OUTFITS, type ArmoireContents } from "@/lib/types";

// The house armoire belongs to the signed-in member alone. Nothing here takes
// a username: every query is scoped to the caller's own rows, so a visitor can
// never reach anyone else's armoire by construction.

// GET: the caller's saved outfits in slot order, what they're wearing now, and
// whether Ghost Mode is on.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = auth.user.userId;

    const [user, outfits] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { avatar: true, ghost: true } }),
      prisma.outfit.findMany({
        where: { ownerId: userId },
        select: OUTFIT_SELECT,
        orderBy: { slot: "asc" },
      }),
    ]);
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    const contents: ArmoireContents = {
      outfits: outfits.map(toOutfit),
      wearing: wearingOf(user.avatar),
      ghost: user.ghost,
    };
    return NextResponse.json(contents);
  } catch (error) {
    console.error("Armoire error:", error);
    return NextResponse.json({ error: "Failed to open your armoire." }, { status: 500 });
  }
}

// POST: save an outfit in the armoire's first empty spot (five at most).
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = auth.user.userId;

    const limited = armoireRateLimited(userId);
    if (limited) return limited;

    const parsed = createOutfitSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    const taken = await prisma.outfit.findMany({
      where: { ownerId: userId },
      select: { slot: true },
    });
    const used = new Set(taken.map((o) => o.slot));
    const slot = Array.from({ length: MAX_OUTFITS }, (_, i) => i).find((i) => !used.has(i));
    if (slot === undefined) {
      return NextResponse.json(
        { error: `Your armoire holds ${MAX_OUTFITS} outfits. Remove one to make room.` },
        { status: 409 },
      );
    }

    try {
      const { name, shirt, pants, shoes } = parsed.data;
      const outfit = await prisma.outfit.create({
        data: { ownerId: userId, slot, name: name ?? "", shirt, pants, shoes },
        select: OUTFIT_SELECT,
      });
      return NextResponse.json(
        { message: "Outfit saved.", outfit: toOutfit(outfit) },
        { status: 201 },
      );
    } catch (error) {
      // Two saves at once raced for the same empty spot.
      if (isUniqueConstraintError(error)) {
        return NextResponse.json(
          { error: "Your armoire changed just then. Try again." },
          { status: 409 },
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Save outfit error:", error);
    return NextResponse.json({ error: "Failed to save that outfit." }, { status: 500 });
  }
}
