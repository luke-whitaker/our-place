import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { currentCalls } from "@/lib/calls";
import { callsCurrentLimiter } from "@/lib/rate-limit";

// GET: the call you're in, if any, and the invitations you haven't answered.
// Every open page polls this about every 10 seconds; for a member in a call,
// the poll is also the heartbeat that keeps them counted as present
// (CALL_PRESENCE_STALE_MS in @/lib/calls).
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const limit = callsCurrentLimiter.check(me);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    return NextResponse.json(await currentCalls(me, new Date()));
  } catch (error) {
    console.error("Current call error:", error);
    return NextResponse.json({ error: "Failed to load your calls." }, { status: 500 });
  }
}
