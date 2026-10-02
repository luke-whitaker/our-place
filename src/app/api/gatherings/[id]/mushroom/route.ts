import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { getZodErrorMessage, plantMushroomSchema } from "@/lib/schemas";
import { gatheringAccess } from "@/lib/gatherings";
import { firstFreeSlot, isUniqueConstraintError } from "@/lib/pockets";
import { plantingWorld } from "@/lib/event-mushroom-planting";
import type { MushroomHome } from "@/lib/event-mushrooms";
import { plantProblem } from "@/lib/game/event-mushroom";

/** A write that lost a race inside its transaction: thrown to roll it back,
 * then answered with its message. */
class MushroomConflict extends Error {}

function refuse(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

type HostCheck =
  { ok: true; plantedAt: Date | null; home: MushroomHome } | { ok: false; response: NextResponse };

/** The checks planting and picking up share: the caller hosts this world
 * gathering, it's still on, and it hasn't started (the mushroom locks then). */
async function hostOfOpenGathering(id: string, me: string): Promise<HostCheck> {
  const limit = itemsLimiter.check(me);
  if (!limit.allowed) {
    return { ok: false, response: refuse("Too many requests. Please try again later.", 429) };
  }
  const access = await gatheringAccess(id, me);
  if (!access) return { ok: false, response: refuse("Gathering not found.", 404) };
  const g = access.gathering;
  if (!access.isHost) {
    return { ok: false, response: refuse("Only the host can move the mushroom.", 403) };
  }
  if (g.kind !== "world") {
    return { ok: false, response: refuse("Only gatherings in the world have a mushroom.", 400) };
  }
  if (g.status === "cancelled") {
    return { ok: false, response: refuse("This gathering was cancelled.", 409) };
  }
  if (g.startsAt.getTime() <= Date.now()) {
    return {
      ok: false,
      response: refuse("It's already started, so the mushroom stays where it is.", 409),
    };
  }
  const home = { host: { id: g.hostId, username: g.host.username }, community: g.community };
  return { ok: true, plantedAt: g.plantedAt, home };
}

// POST: the host plants their Event Mushroom from their pockets, before the
// gathering starts, in a world they may use, on a tile the shared rule allows.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;
    const { id } = await params;

    const host = await hostOfOpenGathering(id, me);
    if (!host.ok) return host.response;
    const parsed = plantMushroomSchema.safeParse(await request.json());
    if (!parsed.success) return refuse(getZodErrorMessage(parsed), 400);
    const { world: worldId, col, row } = parsed.data;
    if (host.plantedAt) return refuse("It's already planted. Pick it up first to move it.", 409);

    const inPockets = await prisma.item.findFirst({
      where: { ownerId: me, kind: "event_mushroom", gatheringId: id, location: "pocket" },
      select: { id: true },
    });
    if (!inPockets) {
      return refuse(
        "Put the Event Mushroom in your pockets first. It starts in your mailbox.",
        409,
      );
    }

    const world = await plantingWorld(worldId, host.home, id);
    if (!world) {
      return refuse(
        "Plant it in the shared world, on your own island, or inside your community's building.",
        403,
      );
    }
    const problem = plantProblem(world, col, row);
    if (problem) return refuse(problem, 400);

    await prisma.$transaction(async (tx) => {
      const taken = await tx.item.deleteMany({
        where: { id: inPockets.id, ownerId: me, location: "pocket" },
      });
      // Guarded on still being unplanted and not yet started, so a second
      // plant or the start arriving mid-request can't slip through.
      const planted = await tx.gathering.updateMany({
        where: { id, status: "scheduled", plantedAt: null, startsAt: { gt: new Date() } },
        data: { mushroomWorld: worldId, mushroomCol: col, mushroomRow: row, plantedAt: new Date() },
      });
      if (taken.count !== 1 || planted.count !== 1) {
        throw new MushroomConflict("The mushroom moved just then. Try again.");
      }
    });

    return NextResponse.json({
      message: "Planted. You can pick it up and move it until the gathering starts.",
      mushroom: { world: worldId, col, row },
    });
  } catch (error) {
    if (error instanceof MushroomConflict) return refuse(error.message, 409);
    console.error("Plant mushroom error:", error);
    return refuse("Failed to plant the mushroom.", 500);
  }
}

// DELETE: the host picks the mushroom back up into their pockets, before the
// gathering starts, to plant it somewhere else.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;
    const { id } = await params;

    const host = await hostOfOpenGathering(id, me);
    if (!host.ok) return host.response;
    if (!host.plantedAt) return refuse("The mushroom isn't planted yet.", 409);

    await prisma.$transaction(async (tx) => {
      const slot = await firstFreeSlot(tx, me, "pocket");
      if (slot === null) throw new MushroomConflict("Make room in your pockets first.");
      const lifted = await tx.gathering.updateMany({
        where: { id, status: "scheduled", plantedAt: { not: null }, startsAt: { gt: new Date() } },
        data: { mushroomWorld: null, mushroomCol: null, mushroomRow: null, plantedAt: null },
      });
      if (lifted.count !== 1)
        throw new MushroomConflict("The mushroom moved just then. Try again.");
      await tx.item.create({
        data: { ownerId: me, kind: "event_mushroom", location: "pocket", slot, gatheringId: id },
      });
    });

    return NextResponse.json({ message: "Picked up. It's in your pockets." });
  } catch (error) {
    if (error instanceof MushroomConflict) return refuse(error.message, 409);
    if (isUniqueConstraintError(error)) {
      return refuse("Your pockets changed just then. Try again.", 409);
    }
    console.error("Pick up mushroom error:", error);
    return refuse("Failed to pick up the mushroom.", 500);
  }
}
