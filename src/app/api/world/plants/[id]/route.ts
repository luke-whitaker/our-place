import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { ITEM_SELECT, isUniqueConstraintError, toPocketItem } from "@/lib/pockets";
import { POCKET_SLOTS } from "@/lib/items";
import { isBloomed, plantById } from "@/lib/plants";

/** A write that lost a race inside its transaction: thrown to roll it back,
 * then answered with its message. */
class PickConflict extends Error {}

function refuse(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

// DELETE: the planter picks up what they planted. An unbloomed seed comes back
// as the seed. A flower comes back as a flower of its color and, if it grew
// from a seed, a seed too: plucking ends the plant, so that seed comes once.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params;
    const plant = await plantById(id);
    if (!plant) return refuse("There's nothing growing there now.", 404);
    if (plant.ownerId !== me) {
      return refuse("Only the person who planted it can pick it up.", 403);
    }

    const bloomed = isBloomed(plant.bloomsAt, new Date());
    const returns: { kind: "seed" | "flower"; color: string | null }[] = bloomed
      ? [
          { kind: "flower", color: plant.color },
          ...(plant.yieldsSeed ? [{ kind: "seed" as const, color: null }] : []),
        ]
      : [{ kind: "seed", color: null }];

    const items = await prisma.$transaction(async (tx) => {
      const occupied = await tx.item.findMany({
        where: { ownerId: me, location: "pocket" },
        select: { slot: true },
      });
      const taken = new Set(occupied.map((i) => i.slot));
      const free = Array.from({ length: POCKET_SLOTS }, (_, slot) => slot).filter(
        (slot) => !taken.has(slot),
      );
      if (free.length < returns.length) {
        throw new PickConflict(
          returns.length === 2
            ? "Make room for two things in your pockets: the flower and its seed."
            : "Make room in your pockets first.",
        );
      }
      const lifted = await tx.worldPlant.deleteMany({ where: { id, ownerId: me } });
      if (lifted.count !== 1) throw new PickConflict("Someone just picked that.");
      // One at a time: an interactive transaction runs on one connection.
      const created = [];
      for (const [i, r] of returns.entries()) {
        created.push(
          await tx.item.create({
            data: { id: uuidv4(), ownerId: me, kind: r.kind, color: r.color, slot: free[i] },
            select: ITEM_SELECT,
          }),
        );
      }
      return created;
    });

    const message = !bloomed
      ? "You dug up the seed."
      : plant.yieldsSeed
        ? "You picked the flower, and found a seed."
        : "You picked the flower.";
    return NextResponse.json({ message, items: items.map(toPocketItem) });
  } catch (error) {
    if (error instanceof PickConflict) return refuse(error.message, 409);
    if (isUniqueConstraintError(error))
      return refuse("Your pockets changed just then. Try again.", 409);
    console.error("Pick plant error:", error);
    return refuse("Failed to pick that up.", 500);
  }
}
