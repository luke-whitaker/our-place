import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { gatheringCalendarSchema, getZodErrorMessage } from "@/lib/schemas";
import {
  CALENDAR_MAX_DAYS,
  ENTRY_SELECT,
  toGatheringEntry,
  UPCOMING_SHOWN,
  type EntryRow,
} from "@/lib/gatherings";
import { cancelUnplanted } from "@/lib/gathering-sweep";
import type { GatheringCalendar } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Which gatherings a calendar holds: a community's, for its members, or the
 * caller's own (hosting, invited, or going; declined ones drop off). */
async function calendarScope(
  me: string,
  community: string | undefined,
): Promise<{ where: Prisma.GatheringWhereInput } | { response: NextResponse }> {
  if (!community) {
    return {
      where: {
        status: "scheduled",
        invites: { some: { userId: me, status: { in: ["pending", "accepted"] } } },
      },
    };
  }
  const found = await prisma.community.findFirst({
    where: { OR: [{ slug: community }, { id: community }] },
    select: { id: true, members: { where: { userId: me }, select: { id: true } } },
  });
  if (!found) {
    return { response: NextResponse.json({ error: "Community not found." }, { status: 404 }) };
  }
  if (found.members.length === 0) {
    return {
      response: NextResponse.json(
        { error: "Join this community to see its gatherings." },
        { status: 403 },
      ),
    };
  }
  return { where: { status: "scheduled", communityId: found.id } };
}

// GET: a calendar's gatherings overlapping [from, to), plus the next few that
// haven't ended. With `community`, that community's calendar (members only);
// without it, the caller's own calendar, which only they can ever read.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = gatheringCalendarSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const from = new Date(parsed.data.from);
    const to = new Date(parsed.data.to);
    if (to <= from || to.getTime() - from.getTime() > CALENDAR_MAX_DAYS * DAY_MS) {
      return NextResponse.json(
        { error: `A calendar can show up to ${CALENDAR_MAX_DAYS} days at a time.` },
        { status: 400 },
      );
    }

    const scope = await calendarScope(me, parsed.data.community);
    if ("response" in scope) return scope.response;
    // A world gathering that started unplanted drops off as it's read.
    await cancelUnplanted();

    const [inRange, upcoming] = await Promise.all([
      prisma.gathering.findMany({
        where: { ...scope.where, startsAt: { lt: to }, endsAt: { gt: from } },
        select: ENTRY_SELECT,
        orderBy: { startsAt: "asc" },
        // A month can't hold more gatherings than anyone could attend; the cap
        // keeps a runaway calendar bounded.
        take: 500,
      }),
      prisma.gathering.findMany({
        where: { ...scope.where, endsAt: { gt: new Date() } },
        select: ENTRY_SELECT,
        orderBy: { startsAt: "asc" },
        take: UPCOMING_SHOWN,
      }),
    ]);

    const ids = [...new Set([...inRange, ...upcoming].map((g) => g.id))];
    const mine = await prisma.gatheringInvite.findMany({
      where: { userId: me, gatheringId: { in: ids } },
      select: { gatheringId: true, status: true },
    });
    const answer = new Map(mine.map((i) => [i.gatheringId, i.status]));
    const toEntry = (row: EntryRow) => toGatheringEntry(row, answer.get(row.id) ?? null);

    const calendar: GatheringCalendar = {
      gatherings: inRange.map(toEntry),
      upcoming: upcoming.map(toEntry),
    };
    return NextResponse.json(calendar);
  } catch (error) {
    console.error("Gathering calendar error:", error);
    return NextResponse.json({ error: "Failed to load the calendar." }, { status: 500 });
  }
}
