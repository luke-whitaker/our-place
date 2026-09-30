import { describe, it, expect, beforeEach } from "vitest";
import prisma from "@/lib/db";
import {
  ACTIVITY_RETENTION_DAYS,
  dayToDate,
  forgetVisit,
  recordVisit,
  recordWorldTime,
  resetVisitRecorder,
  WORLD_ACCOUNT,
} from "@/lib/activity";
import { createTestUser } from "@/test/route-helpers";

// 11 am in Chicago on Wednesday, September 30, 2026.
const NOW = new Date("2026-09-30T16:00:00Z");
const NEXT_DAY = new Date("2026-10-01T16:00:00Z");

async function member(overrides: { username?: string; excluded?: boolean } = {}) {
  const user = await createTestUser(overrides.username ? { username: overrides.username } : {});
  if (overrides.excluded) {
    await prisma.user.update({ where: { id: user.userId }, data: { excludeFromMetrics: true } });
  }
  return {
    id: user.userId,
    username: user.username,
    excludeFromMetrics: overrides.excluded ?? false,
  };
}

function rows(userId: string) {
  return prisma.activityDay.findMany({
    where: { userId },
    orderBy: { day: "asc" },
    select: { day: true, worldSeconds: true },
  });
}

beforeEach(() => {
  resetVisitRecorder();
});

describe("recordVisit", () => {
  it("writes one row per member per day, however many requests come in", async () => {
    const ann = await member();

    await recordVisit(ann, NOW);
    await recordVisit(ann, NOW);
    // Deleting the row proves the second call never reached the database.
    await prisma.activityDay.deleteMany({ where: { userId: ann.id } });
    await recordVisit(ann, NOW);
    expect(await rows(ann.id)).toEqual([]);

    await recordVisit(ann, NEXT_DAY);
    expect(await rows(ann.id)).toEqual([{ day: dayToDate("2026-10-01"), worldSeconds: 0 }]);
  });

  it("counts a member again the same day after they opt out and back in", async () => {
    const ann = await member();
    await recordVisit(ann, NOW);
    // What the account route does when the member opts out.
    await prisma.activityDay.deleteMany({ where: { userId: ann.id } });
    forgetVisit(ann.id);

    await recordVisit(ann, NOW);

    expect(await rows(ann.id)).toHaveLength(1);
  });

  it("never counts an opted-out member or the world's own account", async () => {
    const quiet = await member({ excluded: true });
    const world = await member({ username: WORLD_ACCOUNT });

    await recordVisit(quiet, NOW);
    await recordVisit(world, NOW);

    expect(await prisma.activityDay.count()).toBe(0);
  });

  it("prunes rows past the retention window when a new day starts", async () => {
    const ann = await member();
    const old = dayToDate("2026-09-30");
    old.setUTCDate(old.getUTCDate() - ACTIVITY_RETENTION_DAYS - 1);
    await prisma.activityDay.create({ data: { userId: ann.id, day: old } });

    await recordVisit(ann, NOW);

    expect(await rows(ann.id)).toEqual([{ day: dayToDate("2026-09-30"), worldSeconds: 0 }]);
  });
});

describe("recordWorldTime", () => {
  it("adds each visit to the day it ended", async () => {
    const ann = await member();

    await recordWorldTime(ann.id, 600, NOW);
    await recordWorldTime(ann.id, 120, NOW);

    expect(await rows(ann.id)).toEqual([{ day: dayToDate("2026-09-30"), worldSeconds: 720 }]);
  });

  it("writes nothing for an opted-out member or the world's own account", async () => {
    const quiet = await member({ excluded: true });
    const world = await member({ username: WORLD_ACCOUNT });

    await recordWorldTime(quiet.id, 600, NOW);
    await recordWorldTime(world.id, 600, NOW);

    expect(await prisma.activityDay.count()).toBe(0);
  });
});
