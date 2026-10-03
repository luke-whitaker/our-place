import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { getZodErrorMessage, mushroomWorldSchema, plantSchema } from "@/lib/schemas";
import { checkWorldAccess, parseWorldId } from "@/lib/presence-access";
import { isUniqueConstraintError } from "@/lib/pockets";
import { plantingWorld, plantsInWorld, toPlantWire } from "@/lib/plants";
import { chooseBloom, isFlowerColor, plantCap, plotProblem } from "@/lib/game/plants";

/** A write that lost a race inside its transaction: thrown to roll it back,
 * then answered with its message and status. */
class PlantConflict extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function refuse(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

// GET: every seed and flower growing in a world, for anyone who may be in it.
// A seed's color is never sent before it blooms.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = mushroomWorldSchema.safeParse(params);
    if (!parsed.success) return refuse(getZodErrorMessage(parsed), 400);
    const worldId = parsed.data.world;
    if (!parseWorldId(worldId)) return refuse("Unknown world.", 400);
    const access = await checkWorldAccess(me, worldId);
    if (!access.ok) return refuse(access.error, access.status);

    return NextResponse.json({ plants: await plantsInWorld(worldId, me, new Date()) });
  } catch (error) {
    console.error("Plants error:", error);
    return refuse("Failed to load what's growing here.", 500);
  }
}

// POST: plant a seed, or place a flower, from the caller's pockets on a tile in
// the shared world or their own island. The item moves into the ground: it
// leaves pockets in the same transaction that plants it.
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const limit = itemsLimiter.check(me);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const parsed = plantSchema.safeParse(await request.json());
    if (!parsed.success) return refuse(getZodErrorMessage(parsed), 400);
    const { item_id: itemId, world: worldId, col, row } = parsed.data;

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { ownerId: true, kind: true, location: true, color: true },
    });
    if (!item || item.ownerId !== me || item.location !== "pocket") {
      return refuse("Item not found.", 404);
    }
    if (item.kind !== "seed" && item.kind !== "flower") {
      return refuse("Only seeds and flowers go in the ground.", 400);
    }

    const world = await plantingWorld(worldId, me);
    if (!world) return refuse("Plant in the shared world or on your own island.", 403);
    const problem = plotProblem(world, col, row);
    if (problem) return refuse(problem, 400);

    const now = new Date();
    const growth =
      item.kind === "seed"
        ? { ...chooseBloom(now), yieldsSeed: true }
        : {
            color: isFlowerColor(item.color) ? item.color : "red",
            bloomsAt: null,
            yieldsSeed: false,
          };
    const cap = plantCap(worldId);

    const plant = await prisma.$transaction(async (tx) => {
      // Lock the member's row so two plants racing can't both pass the count.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${me} FOR UPDATE`;
      const standing = await tx.worldPlant.count({ where: { ownerId: me, worldId } });
      if (standing >= cap) {
        const where = worldId === "capital" ? "in the Capital" : "on your island";
        throw new PlantConflict(
          `You have ${cap} things growing ${where} already. Pick one up first.`,
          409,
        );
      }
      const taken = await tx.item.deleteMany({
        where: { id: itemId, ownerId: me, location: "pocket" },
      });
      if (taken.count !== 1) throw new PlantConflict("That just left your pockets.", 409);
      return tx.worldPlant.create({
        data: { ownerId: me, worldId, col, row, plantedAt: now, ...growth },
        select: {
          id: true,
          ownerId: true,
          col: true,
          row: true,
          color: true,
          bloomsAt: true,
          owner: { select: { username: true, displayName: true } },
        },
      });
    });

    const message = item.kind === "seed" ? "Planted. Come back in a day or so." : "Placed.";
    return NextResponse.json({ message, plant: toPlantWire(plant, me, now) });
  } catch (error) {
    if (error instanceof PlantConflict) return refuse(error.message, error.status);
    if (isUniqueConstraintError(error)) return refuse("Something just started growing there.", 409);
    console.error("Plant error:", error);
    return refuse("Failed to plant that.", 500);
  }
}
