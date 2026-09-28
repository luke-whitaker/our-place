import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { isAvatarConfig } from "@/lib/game/avatar-recolor";
import { presenceHub } from "@/lib/presence";
import { armoireRateLimited, dressedIn, findOwnOutfit } from "@/lib/outfits";

// POST: put on one of the caller's saved outfits. Its colors go into the
// avatar itself, so everything that draws the avatar just works, and putting
// on clothes ends Ghost Mode. Anyone nearby sees the new outfit at once.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = auth.user.userId;

    const limited = armoireRateLimited(userId);
    if (limited) return limited;

    const { id } = await params;
    const outfit = await findOwnOutfit(userId, id);
    if (!outfit) return NextResponse.json({ error: "Outfit not found." }, { status: 404 });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatar: true } });
    if (!isAvatarConfig(user?.avatar)) {
      return NextResponse.json(
        { error: "Build your character first, then try on an outfit." },
        { status: 409 },
      );
    }

    const avatar = dressedIn(user.avatar, outfit);
    await prisma.user.update({ where: { id: userId }, data: { avatar, ghost: false } });

    // Avatar first, while a ghost is still hidden, so coming back into view
    // shows the new outfit rather than the old one for a moment.
    const hub = presenceHub();
    hub.setAvatar(userId, avatar);
    hub.setGhost(userId, false);

    return NextResponse.json({ message: "Outfit on.", avatar, ghost: false });
  } catch (error) {
    console.error("Wear outfit error:", error);
    return NextResponse.json({ error: "Failed to put that outfit on." }, { status: 500 });
  }
}
