import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { changeGatheringTimeLimiter } from "@/lib/rate-limit";
import { changeGatheringTimeSchema, getZodErrorMessage } from "@/lib/schemas";
import { gatheringAccess, moveGathering, timesProblem, toGatheringEntry } from "@/lib/gatherings";
import { emailGathering } from "@/lib/gathering-emails";
import type { GatheringDetail, GatheringPerson, GatheringStatus } from "@/lib/types";

function toPerson(user: { username: string; displayName: string }): GatheringPerson {
  return { username: user.username, display_name: user.displayName };
}

// GET: one gathering, address included, for anyone who can see it (the host,
// an invitee, or a current member of its community). Everyone else gets 404.
// The host also gets everyone's answers; invitees see only who's going.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { id } = await params;

    const access = await gatheringAccess(id, auth.user.userId);
    if (!access) return NextResponse.json({ error: "Gathering not found." }, { status: 404 });

    const [details, invites] = await Promise.all([
      prisma.gathering.findUniqueOrThrow({
        where: { id },
        select: { description: true, address: true },
      }),
      prisma.gatheringInvite.findMany({
        where: { gatheringId: id },
        select: { status: true, user: { select: { username: true, displayName: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const byStatus = (status: string) =>
      invites.filter((i) => i.status === status).map((i) => toPerson(i.user));

    const gathering: GatheringDetail = {
      ...toGatheringEntry(access.gathering, access.invite?.status ?? null),
      description: details.description,
      address: details.address,
      status: access.gathering.status as GatheringStatus,
      is_host: access.isHost,
      started: access.gathering.startsAt.getTime() <= Date.now(),
      ended: access.gathering.endsAt.getTime() <= Date.now(),
      going: byStatus("accepted"),
      attendees: access.isHost
        ? {
            accepted: byStatus("accepted"),
            pending: byStatus("pending"),
            declined: byStatus("declined"),
          }
        : null,
      mushroom:
        access.gathering.kind === "world" ? { planted: access.gathering.plantedAt !== null } : null,
    };
    return NextResponse.json({ gathering });
  } catch (error) {
    console.error("Gathering error:", error);
    return NextResponse.json({ error: "Failed to load that gathering." }, { status: 500 });
  }
}

// PATCH: the host moves a gathering to a new date and time, until it starts.
// Answers stay as they were; everyone still invited gets a notification now
// and an email after the commit, asking anyone who can't make it to update
// their answer. A planted Event Mushroom stays where it is.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const limit = changeGatheringTimeLimiter.check(me);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const parsed = changeGatheringTimeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    const { id } = await params;
    const access = await gatheringAccess(id, me);
    if (!access) return NextResponse.json({ error: "Gathering not found." }, { status: 404 });
    const g = access.gathering;
    if (!access.isHost) {
      return NextResponse.json({ error: "Only the host can change the time." }, { status: 403 });
    }
    if (g.status === "cancelled") {
      return NextResponse.json({ error: "This gathering is cancelled." }, { status: 409 });
    }
    const now = new Date();
    if (g.startsAt.getTime() <= now.getTime()) {
      return NextResponse.json(
        { error: "This gathering has started, so its time can't change." },
        { status: 409 },
      );
    }

    const startsAt = new Date(parsed.data.starts_at);
    const endsAt = new Date(parsed.data.ends_at);
    const problem = timesProblem(startsAt, endsAt, now);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    if (startsAt.getTime() === g.startsAt.getTime() && endsAt.getTime() === g.endsAt.getTime()) {
      return NextResponse.json({ error: "That's the time it already has." }, { status: 400 });
    }

    const told = await prisma.$transaction((tx) =>
      moveGathering(tx, { id, hostId: me, title: g.title }, startsAt, endsAt, now),
    );
    if (!told) {
      return NextResponse.json(
        { error: "This gathering just started or was cancelled." },
        { status: 409 },
      );
    }
    // After the commit, and not awaited; emailGathering logs its own failures.
    void emailGathering("time_changed", id, told);

    return NextResponse.json({ message: "The new time is set, and everyone invited was told." });
  } catch (error) {
    console.error("Change gathering time error:", error);
    return NextResponse.json({ error: "Failed to change the time." }, { status: 500 });
  }
}
