import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { gatheringResponseLimiter } from "@/lib/rate-limit";
import { gatheringResponseSchema, getZodErrorMessage } from "@/lib/schemas";
import { gatheringAccess } from "@/lib/gatherings";

// POST: accept or decline a gathering. The invitation letter and the
// notification both call this one route and both read the invite row, so an
// answer given in one shows in the other. Answers can change until the
// gathering starts. A community member who joined after the gathering was
// made gets their invite row here, on their first answer.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const parsed = gatheringResponseSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const { response } = parsed.data;
    const { id } = await params;

    const access = await gatheringAccess(id, me);
    if (!access) return NextResponse.json({ error: "Gathering not found." }, { status: 404 });
    if (access.gathering.status === "cancelled") {
      return NextResponse.json({ error: "This gathering was cancelled." }, { status: 409 });
    }
    if (access.gathering.startsAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "This gathering has already started." }, { status: 409 });
    }
    if (access.isHost && response === "declined") {
      return NextResponse.json(
        { error: "You're hosting this one. Cancel it instead if it isn't happening." },
        { status: 400 },
      );
    }

    await prisma.gatheringInvite.upsert({
      where: { gatheringId_userId: { gatheringId: id, userId: me } },
      create: { gatheringId: id, userId: me, status: response, respondedAt: new Date() },
      update: { status: response, respondedAt: new Date() },
    });

    return NextResponse.json({
      message: response === "accepted" ? "You're going." : "You declined.",
      my_response: response,
    });
  } catch (error) {
    console.error("Gathering response error:", error);
    return NextResponse.json({ error: "Failed to save your answer." }, { status: 500 });
  }
}
