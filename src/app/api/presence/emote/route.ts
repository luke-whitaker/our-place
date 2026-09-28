import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { presenceEmoteLimiter } from "@/lib/rate-limit";
import { presenceEmoteSchema, getZodErrorMessage } from "@/lib/schemas";
import { presenceHub } from "@/lib/presence";
import { checkWorldAccess } from "@/lib/presence-access";

// POST: show an emote over the caller's head to everyone in their world.
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = auth.user.userId;

    const limit = presenceEmoteLimiter.check(userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "That's a lot of emotes. Give it a moment." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const parsed = presenceEmoteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const { world_id, emote } = parsed.data;

    const access = await checkWorldAccess(userId, world_id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    if (presenceHub().emote(userId, world_id, emote) === "not-here") {
      return NextResponse.json({ error: "Step into the world before you emote." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Presence emote error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
