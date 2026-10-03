import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { declineCall } from "@/lib/calls";
import { callActionLimiter } from "@/lib/rate-limit";

// POST: turn down an invitation to a call. Nobody is told; the caller's
// list just stops showing you as invited.
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
    if (!(await declineCall(me, id, new Date()))) {
      return NextResponse.json({ error: "There's no invitation to answer." }, { status: 404 });
    }
    return NextResponse.json({ message: "Declined." });
  } catch (error) {
    console.error("Decline call error:", error);
    return NextResponse.json({ error: "Failed to decline the call." }, { status: 500 });
  }
}
