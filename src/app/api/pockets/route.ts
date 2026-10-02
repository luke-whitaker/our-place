import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { toPocketItem, ITEM_SELECT } from "@/lib/pockets";
import { plantableWorlds } from "@/lib/event-mushrooms";
import type { PocketMushroomInfo } from "@/lib/types";

/** What Pockets needs to offer "Plant here" for each Event Mushroom: its
 * gathering's name, start, and the worlds its host may plant in. A mushroom
 * whose gathering is gone or cancelled gets nothing to offer. */
async function mushroomInfo(gatheringIds: string[]): Promise<Map<string, PocketMushroomInfo>> {
  if (gatheringIds.length === 0) return new Map();
  const rows = await prisma.gathering.findMany({
    where: { id: { in: gatheringIds }, status: "scheduled" },
    select: {
      id: true,
      title: true,
      startsAt: true,
      hostId: true,
      host: { select: { username: true } },
      community: { select: { slug: true } },
    },
  });
  return new Map(
    rows.map((g) => [
      g.id,
      {
        title: g.title,
        starts_at: g.startsAt.toISOString(),
        worlds: plantableWorlds({
          host: { id: g.hostId, username: g.host.username },
          community: g.community,
        }),
      },
    ]),
  );
}

// GET: the caller's pocket contents (items in the "pocket" location), in
// slot order. Mailbox letters never appear here, even before they're taken.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const items = await prisma.item.findMany({
      where: { ownerId: auth.user.userId, location: "pocket" },
      select: ITEM_SELECT,
      orderBy: { slot: "asc" },
    });
    const mushrooms = await mushroomInfo(
      items.flatMap((i) => (i.kind === "event_mushroom" && i.gatheringId ? [i.gatheringId] : [])),
    );

    return NextResponse.json({
      items: items.map((item) => ({
        ...toPocketItem(item),
        mushroom:
          item.kind === "event_mushroom" && item.gatheringId
            ? (mushrooms.get(item.gatheringId) ?? null)
            : null,
      })),
    });
  } catch (error) {
    console.error("Pockets error:", error);
    return NextResponse.json({ error: "Failed to load your pockets." }, { status: 500 });
  }
}
