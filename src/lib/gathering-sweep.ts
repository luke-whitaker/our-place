// A world gathering whose Event Mushroom isn't planted by its start time is
// cancelled (Luke, September 30). Two paths do it, so correctness never rests
// on a timer alone: a once-a-minute sweep in the server process, and the same
// call made lazily wherever a gathering is read. Both run cancelUnplanted,
// which is idempotent: each cancel is guarded on the row still being
// scheduled and unplanted, so two runs racing can't notify twice.

import prisma from "@/lib/db";

/** How many overdue gatherings one run cancels. Anything past it waits for
 * the next run, so a backlog can never make one request slow. */
export const SWEEP_BATCH = 25;
/** How often the background sweep runs. */
const SWEEP_INTERVAL_MS = 60_000;

/** Cancel one overdue gathering, if it still is: mark it, remove the unplanted
 * mushroom, and tell the host and everyone who accepted. Returns whether this
 * call was the one that cancelled it. */
async function cancelOne(id: string, hostId: string, now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const cancelled = await tx.gathering.updateMany({
      where: { id, status: "scheduled", plantedAt: null, startsAt: { lte: now } },
      data: { status: "cancelled", cancelledAt: now },
    });
    if (cancelled.count !== 1) return false;
    await tx.item.deleteMany({ where: { gatheringId: id, kind: "event_mushroom" } });
    const going = await tx.gatheringInvite.findMany({
      where: { gatheringId: id, status: "accepted" },
      select: { userId: true },
    });
    const recipients = [...new Set([hostId, ...going.map((g) => g.userId)])];
    await tx.notification.createMany({
      data: recipients.map((recipientId) => ({
        recipientId,
        actorId: hostId,
        kind: "gathering_unplanted",
        gatheringId: id,
      })),
    });
    return true;
  });
}

/** Cancel up to SWEEP_BATCH world gatherings that reached their start with
 * no mushroom planted. Returns how many this run cancelled. */
export async function cancelUnplanted(now: Date = new Date()): Promise<number> {
  const overdue = await prisma.gathering.findMany({
    where: { kind: "world", status: "scheduled", plantedAt: null, startsAt: { lte: now } },
    select: { id: true, hostId: true },
    orderBy: { startsAt: "asc" },
    take: SWEEP_BATCH,
  });
  let count = 0;
  for (const g of overdue) {
    if (await cancelOne(g.id, g.hostId, now)) count++;
  }
  return count;
}

// One timer per process, held on globalThis so a dev hot reload doesn't start
// a second one beside the first.
const globalForSweep = globalThis as unknown as { gatheringSweep?: ReturnType<typeof setInterval> };

/** Start the background sweep. Called once at server start (instrumentation.ts).
 * A failed run is logged and the next one tries again. */
export function startGatheringSweep(): void {
  if (globalForSweep.gatheringSweep) return;
  globalForSweep.gatheringSweep = setInterval(() => {
    cancelUnplanted().catch((error) => console.error("Gathering sweep error:", error));
  }, SWEEP_INTERVAL_MS);
  // Never keep the process alive just for the sweep.
  globalForSweep.gatheringSweep.unref?.();
}
