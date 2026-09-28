import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { presenceMoveLimiter } from "@/lib/rate-limit";
import { presenceMoveSchema, getZodErrorMessage } from "@/lib/schemas";
import { isAvatarConfig } from "@/lib/game/avatar-recolor";
import { presenceHub, type PresenceProfile } from "@/lib/presence";
import { checkWorldAccess } from "@/lib/presence-access";

// POST: where the caller stands in a world. Everyone else listening to that
// world hears it through their presence stream; the caller never does.
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = auth.user.userId;

    const limit = presenceMoveLimiter.check(userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const parsed = presenceMoveSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const { world_id, ...pos } = parsed.data;

    const access = await checkWorldAccess(userId, world_id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const hub = presenceHub();
    // The profile is read once, when a member first appears, not on every step.
    const profile = hub.knows(userId) ? undefined : await loadProfile(userId);
    if (profile === null) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const result = hub.move(userId, world_id, pos, profile);
    if (result === "full") {
      return NextResponse.json(
        { error: "The world is full right now. Try again in a minute." },
        { status: 503 },
      );
    }
    // "needs-profile" means the member left between knows() and move(): the
    // next position, a moment later, carries the profile.
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Presence move error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

async function loadProfile(userId: string): Promise<PresenceProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, displayName: true, avatar: true, ghost: true },
  });
  if (!user) return null;
  return {
    username: user.username,
    display_name: user.displayName,
    avatar: isAvatarConfig(user.avatar) ? user.avatar : null,
    ghost: user.ghost,
  };
}
