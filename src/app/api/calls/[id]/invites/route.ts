import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { inviteToCall } from "@/lib/calls";
import { callInviteLimiter } from "@/lib/rate-limit";
import { getZodErrorMessage, inviteToCallSchema } from "@/lib/schemas";

// POST { usernames }: invite more of your own friends into a call you're in.
// They don't have to be friends with anyone else there.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const limit = callInviteLimiter.check(me);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const parsed = inviteToCallSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    const { id } = await params;
    const invited = await inviteToCall(me, id, parsed.data.usernames, new Date());
    if (!invited.ok) {
      return NextResponse.json({ error: invited.error }, { status: invited.status });
    }
    return NextResponse.json({
      message: invited.value === 1 ? "Invited." : `Invited ${invited.value} friends.`,
      invited: invited.value,
    });
  } catch (error) {
    console.error("Call invite error:", error);
    return NextResponse.json({ error: "Failed to invite to the call." }, { status: 500 });
  }
}
