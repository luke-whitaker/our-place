import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { currentCalls } from "@/lib/calls";
import { callsCurrentLimiter } from "@/lib/rate-limit";

// GET: the call you're in, if any, and the invitations you haven't answered.
// Every open page polls this about every 10 seconds. The page connected to the
// call's audio adds ?heartbeat=1, which keeps its member counted as present
// (CALL_PRESENCE_STALE_MS in @/lib/calls); other tabs only look.
export async function GET(request: NextRequest) {
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

    const heartbeat = request.nextUrl.searchParams.get("heartbeat") === "1";
    return NextResponse.json(await currentCalls(me, new Date(), heartbeat));
  } catch (error) {
    console.error("Current call error:", error);
    return NextResponse.json({ error: "Failed to load your calls." }, { status: 500 });
  }
}
