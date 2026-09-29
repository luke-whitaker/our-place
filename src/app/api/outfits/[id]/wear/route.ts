import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { armoireRateLimited, findOwnOutfit, toOutfit, wearLook } from "@/lib/outfits";

// POST: put on one of the caller's saved outfits: its hair and clothes, never
// skin. Putting on clothes ends Ghost Mode, and anyone nearby sees the new
// look at once (see wearLook).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = auth.user.userId;

    const limited = armoireRateLimited(userId);
    if (limited) return limited;

    const { id } = await params;
    const row = await findOwnOutfit(userId, id);
    if (!row) return NextResponse.json({ error: "Outfit not found." }, { status: 404 });

    const worn = await wearLook(userId, toOutfit(row));
    if (worn.error) return worn.error;
    return NextResponse.json({ message: "Outfit on.", avatar: worn.avatar, ghost: false });
  } catch (error) {
    console.error("Wear outfit error:", error);
    return NextResponse.json({ error: "Failed to put that outfit on." }, { status: 500 });
  }
}
