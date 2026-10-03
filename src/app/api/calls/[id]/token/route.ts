import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { joinCall } from "@/lib/calls";
import { CALL_TOKEN_TTL_SECONDS, mintCallToken, voiceConfigured, voiceUrl } from "@/lib/livekit";
import { callTokenLimiter } from "@/lib/rate-limit";
import type { CallTokenResponse } from "@/lib/types";

// POST: join a call (or stay in it) and get a LiveKit token for its room.
// The checks live in joinCall: an open invitation or an earlier place in the
// call, not a ghost, not present in another call, room under the cap, and no
// block with anyone present. The token carries microphone audio only and
// lasts CALL_TOKEN_TTL_SECONDS; the client asks again before it runs out.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const limit = callTokenLimiter.check(me);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }
    if (!voiceConfigured()) {
      return NextResponse.json({ error: "Voice isn't set up on this server." }, { status: 503 });
    }

    const { id } = await params;
    const now = new Date();
    const joined = await joinCall(me, id, now);
    if (!joined.ok) return NextResponse.json({ error: joined.error }, { status: joined.status });

    const body: CallTokenResponse = {
      message: "You're in the call.",
      call_id: id,
      url: voiceUrl(),
      token: await mintCallToken({ callId: id, userId: me, displayName: joined.value.displayName }),
      expires_at: new Date(now.getTime() + CALL_TOKEN_TTL_SECONDS * 1000).toISOString(),
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Call token error:", error);
    return NextResponse.json({ error: "Failed to join the call." }, { status: 500 });
  }
}
