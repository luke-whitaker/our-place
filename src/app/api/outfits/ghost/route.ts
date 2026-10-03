import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ghostModeSchema, getZodErrorMessage } from "@/lib/schemas";
import { presenceHub } from "@/lib/presence";
import { armoireRateLimited } from "@/lib/outfits";
import { leaveEveryCall } from "@/lib/calls";

// POST { on }: turn Ghost Mode on or off. While it's on, nobody else in the
// world sees the caller or their emotes; it stays on across visits until they
// change it here. The presence hub applies it at once to everyone nearby, and
// a ghost can't be heard either: turning it on takes them out of any call.
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = auth.user.userId;

    const limited = armoireRateLimited(userId);
    if (limited) return limited;

    const parsed = ghostModeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const ghost = parsed.data.on;

    await prisma.user.update({ where: { id: userId }, data: { ghost } });
    presenceHub().setGhost(userId, ghost);
    if (ghost) await leaveEveryCall(userId, new Date());

    return NextResponse.json({
      message: ghost ? "You're a ghost now. Nobody else can see you." : "You're visible again.",
      ghost,
    });
  } catch (error) {
    console.error("Ghost Mode error:", error);
    return NextResponse.json({ error: "Failed to change Ghost Mode." }, { status: 500 });
  }
}
