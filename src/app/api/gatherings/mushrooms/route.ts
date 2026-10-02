import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getZodErrorMessage, mushroomWorldSchema } from "@/lib/schemas";
import { checkWorldAccess, parseWorldId } from "@/lib/presence-access";
import { activeInWorld, openableIds } from "@/lib/event-mushrooms";
import type { PlantedMushroomWire } from "@/lib/types";

// GET: every Event Mushroom standing in a world right now, for anyone who may
// be in that world. Everyone sees a mushroom; `invited` says whether this
// viewer may open its gathering, and nothing else about it is sent.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = mushroomWorldSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const worldId = parsed.data.world;
    if (!parseWorldId(worldId)) {
      return NextResponse.json({ error: "Unknown world." }, { status: 400 });
    }
    const access = await checkWorldAccess(me, worldId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const standing = await activeInWorld(worldId, new Date());
    const openable = await openableIds(me, standing);
    const mushrooms: PlantedMushroomWire[] = standing.map((g) => ({
      gathering_id: g.id,
      col: g.col,
      row: g.row,
      host: g.host,
      invited: openable.has(g.id),
    }));
    return NextResponse.json({ mushrooms });
  } catch (error) {
    console.error("Event mushrooms error:", error);
    return NextResponse.json({ error: "Failed to load the mushrooms here." }, { status: 500 });
  }
}
