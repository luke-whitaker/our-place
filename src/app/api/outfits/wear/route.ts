import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getZodErrorMessage, outfitLookSchema } from "@/lib/schemas";
import { armoireRateLimited, wearLook } from "@/lib/outfits";

// POST: put on a look straight from the armoire's editor, without saving it
// as an outfit. Hair and clothes only: the body has no skin field, so skin
// can never change here. Ends Ghost Mode, like wearing a saved outfit.
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = auth.user.userId;

    const limited = armoireRateLimited(userId);
    if (limited) return limited;

    const parsed = outfitLookSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    const worn = await wearLook(userId, parsed.data);
    if (worn.error) return worn.error;
    return NextResponse.json({ message: "Look on.", avatar: worn.avatar, ghost: false });
  } catch (error) {
    console.error("Wear look error:", error);
    return NextResponse.json({ error: "Failed to put that on." }, { status: 500 });
  }
}
