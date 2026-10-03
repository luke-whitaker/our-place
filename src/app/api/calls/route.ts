import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { pruneCalls, startCall } from "@/lib/calls";
import { voiceConfigured } from "@/lib/livekit";
import { startCallLimiter } from "@/lib/rate-limit";
import { getZodErrorMessage, startCallSchema } from "@/lib/schemas";

// POST { usernames }: start a voice call with some of your friends. You're in
// it at once (ask for a token next); each friend gets an invitation that
// lasts 10 minutes and a notification. Nothing leaves the site.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const limit = startCallLimiter.check(me);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }
    if (!voiceConfigured()) {
      return NextResponse.json({ error: "Voice isn't set up on this server." }, { status: 503 });
    }

    const parsed = startCallSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    const now = new Date();
    await pruneCalls(now);
    const started = await startCall(me, parsed.data.usernames, now);
    if (!started.ok) {
      return NextResponse.json({ error: started.error }, { status: started.status });
    }
    return NextResponse.json(
      { message: "Calling your friends.", call_id: started.value },
      { status: 201 },
    );
  } catch (error) {
    console.error("Start call error:", error);
    return NextResponse.json({ error: "Failed to start the call." }, { status: 500 });
  }
}
