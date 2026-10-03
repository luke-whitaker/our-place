import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { leaveCall } from "@/lib/calls";
import { callActionLimiter } from "@/lib/rate-limit";

// POST: leave a call. You can rejoin while it lasts. The last one out ends
// it, and its LiveKit room is closed.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const limit = callActionLimiter.check(me);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const { id } = await params;
    if (!(await leaveCall(me, id, new Date()))) {
      return NextResponse.json({ error: "You're not in this call." }, { status: 404 });
    }
    return NextResponse.json({ message: "You left the call." });
  } catch (error) {
    console.error("Leave call error:", error);
    return NextResponse.json({ error: "Failed to leave the call." }, { status: 500 });
  }
}
