import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { notBlockedWith } from "@/lib/blocks";
import { activeMushroomWhere, mushroomPlace } from "@/lib/event-mushrooms";
import { gatheringSpawnId } from "@/lib/game/event-mushroom";
import type { GatheringTravelStop } from "@/lib/types";

/** The most stops the Gatherings menu lists; nobody has more mushrooms
 * planted for them at once than this. */
const MAX_STOPS = 20;

// GET: the gatherings whose Event Mushroom the caller can travel to on the
// Mycelium Network right now: planted, not over, not cancelled, and the
// caller is the host, invited, or a member of the gathering's community (the
// same rule as the calendar portal). Soonest first.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const rows = await prisma.gathering.findMany({
      where: {
        ...activeMushroomWhere(new Date()),
        host: notBlockedWith(me),
        OR: [
          { hostId: me },
          { invites: { some: { userId: me } } },
          { community: { members: { some: { userId: me } } } },
        ],
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        hostId: true,
        mushroomWorld: true,
        host: { select: { username: true } },
        community: { select: { slug: true } },
      },
      orderBy: { startsAt: "asc" },
      take: MAX_STOPS,
    });

    const stops: GatheringTravelStop[] = rows.flatMap((g) => {
      const home = { host: { id: g.hostId, username: g.host.username }, community: g.community };
      const place = g.mushroomWorld ? mushroomPlace(g.mushroomWorld, home) : null;
      if (!place) return [];
      return [
        {
          gathering_id: g.id,
          title: g.title,
          starts_at: g.startsAt.toISOString(),
          place,
          spawn_at: gatheringSpawnId(g.id),
        },
      ];
    });
    return NextResponse.json({ stops });
  } catch (error) {
    console.error("Gathering travel error:", error);
    return NextResponse.json({ error: "Failed to load your gatherings." }, { status: 500 });
  }
}
