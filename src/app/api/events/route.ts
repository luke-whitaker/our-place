import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { createEventLimiter } from "@/lib/rate-limit";
import { createEventSchema, getZodErrorMessage } from "@/lib/schemas";
import { parsePagination, paginateResults } from "@/lib/pagination";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }

    const { limit, offset, page } = parsePagination(new URL(request.url).searchParams);

    // Get community IDs the user belongs to
    const memberships = await prisma.communityMember.findMany({
      where: { userId: auth.userId },
      select: { communityId: true },
    });
    const communityIds = memberships.map((m) => m.communityId);

    // Get event IDs the user has RSVP'd to
    const rsvps = await prisma.eventRsvp.findMany({
      where: { userId: auth.userId },
      select: { eventId: true },
    });
    const rsvpEventIds = rsvps.map((r) => r.eventId);

    // Get upcoming events from user's communities, RSVP'd events, or events they created
    const events = await prisma.event.findMany({
      where: {
        eventDate: { gte: new Date() },
        OR: [
          { communityId: { in: communityIds } },
          { id: { in: rsvpEventIds } },
          { creatorId: auth.userId },
        ],
      },
      include: {
        creator: { select: { displayName: true, username: true, avatarColor: true } },
        community: { select: { name: true, icon: true } },
        rsvps: { select: { id: true } },
      },
      orderBy: { eventDate: "asc" },
      take: limit + 1,
      skip: offset,
    });

    // Get user's RSVP status for each event
    const userRsvps = await prisma.eventRsvp.findMany({
      where: { userId: auth.userId, eventId: { in: events.map((e) => e.id) } },
      select: { eventId: true, status: true },
    });
    const rsvpMap = new Map(userRsvps.map((r) => [r.eventId, r.status]));

    const mapped = events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      location: e.location,
      event_date: e.eventDate.toISOString(),
      event_end_date: e.eventEndDate?.toISOString() ?? null,
      community_id: e.communityId,
      creator_id: e.creatorId,
      created_at: e.createdAt.toISOString(),
      creator_name: e.creator.displayName,
      creator_username: e.creator.username,
      creator_avatar_color: e.creator.avatarColor,
      community_name: e.community?.name ?? null,
      community_icon: e.community?.icon ?? null,
      rsvp_count: e.rsvps.length,
      user_rsvp: rsvpMap.get(e.id) ?? null,
    }));

    const { data: paginatedEvents, hasMore } = paginateResults(mapped, limit, page);

    // Get events the user has RSVP'd to (for calendar view)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const myEvents = await prisma.event.findMany({
      where: {
        eventDate: { gte: sevenDaysAgo },
        rsvps: { some: { userId: auth.userId } },
      },
      include: {
        community: { select: { name: true, icon: true } },
        rsvps: { where: { userId: auth.userId }, select: { status: true } },
      },
      orderBy: { eventDate: "asc" },
    });

    const mappedMyEvents = myEvents.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      location: e.location,
      event_date: e.eventDate.toISOString(),
      event_end_date: e.eventEndDate?.toISOString() ?? null,
      community_id: e.communityId,
      creator_id: e.creatorId,
      created_at: e.createdAt.toISOString(),
      community_name: e.community?.name ?? null,
      community_icon: e.community?.icon ?? null,
      user_rsvp: e.rsvps.length > 0 ? e.rsvps[0].status : null,
    }));

    return NextResponse.json({ events: paginatedEvents, myEvents: mappedMyEvents, hasMore, page });
  } catch (error) {
    console.error("Events error:", error);
    return NextResponse.json({ error: "Failed to load events." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }

    const limit = createEventLimiter.check(auth.userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many events created. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await request.json();
    const parsed = createEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const { title, description, location, event_date, event_end_date, community_id } = parsed.data;

    const id = uuidv4();

    await prisma.event.create({
      data: {
        id,
        title,
        description,
        location: location || "",
        eventDate: new Date(event_date),
        eventEndDate: event_end_date ? new Date(event_end_date) : null,
        communityId: community_id || null,
        creatorId: auth.userId,
      },
    });

    // Auto-RSVP the creator
    await prisma.eventRsvp.create({
      data: { eventId: id, userId: auth.userId, status: "going" },
    });

    return NextResponse.json({ id, message: "Event created!" }, { status: 201 });
  } catch (error) {
    console.error("Create event error:", error);
    return NextResponse.json({ error: "Failed to create event." }, { status: 500 });
  }
}
