import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { updateOutfitSchema, getZodErrorMessage } from "@/lib/schemas";
import { armoireRateLimited, lookColumns, OUTFIT_SELECT, toOutfit } from "@/lib/outfits";

type Params = { params: Promise<{ id: string }> };

// PATCH: rename a saved outfit or change its look. Only the caller's own;
// anyone else's is simply not found. Fields left out stay as they are
// (Prisma skips an undefined column).
export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = auth.user.userId;

    const limited = armoireRateLimited(userId);
    if (limited) return limited;

    const parsed = updateOutfitSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    const { id } = await params;
    const { name, ...look } = parsed.data;
    const { count } = await prisma.outfit.updateMany({
      where: { id, ownerId: userId },
      data: { name, ...lookColumns(look) },
    });
    if (count === 0) return NextResponse.json({ error: "Outfit not found." }, { status: 404 });

    const outfit = await prisma.outfit.findUniqueOrThrow({ where: { id }, select: OUTFIT_SELECT });
    return NextResponse.json({ message: "Outfit updated.", outfit: toOutfit(outfit) });
  } catch (error) {
    console.error("Update outfit error:", error);
    return NextResponse.json({ error: "Failed to change that outfit." }, { status: 500 });
  }
}

// DELETE: take a saved outfit out of the armoire. What you're wearing stays on.
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = auth.user.userId;

    const limited = armoireRateLimited(userId);
    if (limited) return limited;

    const { id } = await params;
    const { count } = await prisma.outfit.deleteMany({ where: { id, ownerId: userId } });
    if (count === 0) return NextResponse.json({ error: "Outfit not found." }, { status: 404 });

    return NextResponse.json({ message: "Outfit removed." });
  } catch (error) {
    console.error("Delete outfit error:", error);
    return NextResponse.json({ error: "Failed to remove that outfit." }, { status: 500 });
  }
}
