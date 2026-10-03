import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { gatheringResponseLimiter } from "@/lib/rate-limit";
import { cancelGathering, gatheringAccess } from "@/lib/gatherings";

// POST: the host cancels a gathering before it ends. The row stays, marked
// cancelled, so letters and notifications about it can say so; everyone who
// had accepted is told. Batched with createMany because a community gathering
// can have hundreds of guests; the host, the only person notify() would skip,
// is left out of the recipients here.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const limit = gatheringResponseLimiter.check(me);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const { id } = await params;
    const access = await gatheringAccess(id, me);
    if (!access) return NextResponse.json({ error: "Gathering not found." }, { status: 404 });
    if (!access.isHost) {
      return NextResponse.json({ error: "Only the host can cancel a gathering." }, { status: 403 });
    }
    if (access.gathering.status === "cancelled") {
      return NextResponse.json({ error: "This gathering is already cancelled." }, { status: 409 });
    }
    if (access.gathering.endsAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "This gathering has already ended." }, { status: 409 });
    }

    await prisma.$transaction((tx) => cancelGathering(tx, id, me));

    return NextResponse.json({ message: "Your gathering is cancelled. Everyone going was told." });
  } catch (error) {
    console.error("Cancel gathering error:", error);
    return NextResponse.json({ error: "Failed to cancel that gathering." }, { status: 500 });
  }
}
