import { describe, it, expect } from "vitest";
import prisma from "@/lib/db";
import { WORLD_ACCOUNT, dayToDate } from "@/lib/activity";
import { getMetrics } from "@/lib/metrics";
import { METRICS_LETTER } from "@/lib/metrics-letter";
import { createTestPost, createTestUser } from "@/test/route-helpers";

// Wednesday, September 30, 2026, 11 am in Chicago: this week starts Monday the 28th.
const NOW = new Date("2026-09-30T16:00:00Z");

async function joinedOn(createdAt: string, opts: { username?: string; excluded?: boolean } = {}) {
  const user = await createTestUser(opts.username ? { username: opts.username } : {});
  await prisma.user.update({
    where: { id: user.userId },
    data: { createdAt: new Date(createdAt), excludeFromMetrics: opts.excluded ?? false },
  });
  return user.userId;
}

function activeOn(userId: string, day: string, worldSeconds = 0) {
  return prisma.activityDay.create({ data: { userId, day: dayToDate(day), worldSeconds } });
}

async function postAt(authorId: string, createdAt: string) {
  const id = await createTestPost({ authorId });
  await prisma.post.update({ where: { id }, data: { createdAt: new Date(createdAt) } });
}

function letter(ownerId: string, fromId: string, placedAt: string, slot: number, body = "Hi") {
  return prisma.item.create({
    data: {
      ownerId,
      fromId,
      kind: "note",
      location: "mailbox",
      slot,
      body,
      placedAt: new Date(placedAt),
    },
  });
}

describe("getMetrics", () => {
  it("counts weeks in Chicago time and builds retention by month joined", async () => {
    const ann = await joinedOn("2026-08-15T18:00:00Z");
    const bo = await joinedOn("2026-09-02T18:00:00Z");
    const world = await joinedOn("2026-02-06T18:00:00Z", { username: WORLD_ACCOUNT });
    await joinedOn("2026-09-03T18:00:00Z", { excluded: true });

    await activeOn(ann, "2026-09-22");
    await activeOn(ann, "2026-09-29", 3600);
    await activeOn(bo, "2026-09-29", 1800);

    // 11:30 pm Sunday the 27th in Chicago is Monday in UTC: it belongs to last week.
    await postAt(ann, "2026-09-28T04:30:00Z");
    await postAt(ann, "2026-09-29T15:00:00Z");
    await letter(bo, ann, "2026-09-29T15:00:00Z", 0);
    await letter(bo, world, "2026-09-29T15:00:00Z", 1);
    await letter(ann, bo, "2026-09-29T15:00:00Z", 0, METRICS_LETTER);
    await prisma.friendship.create({
      data: {
        userId: ann,
        friendId: bo,
        status: "accepted",
        createdAt: new Date("2026-09-29T15:00:00Z"),
      },
    });
    await prisma.friendship.create({
      data: { userId: bo, friendId: world, createdAt: new Date("2026-09-29T15:00:00Z") },
    });

    const metrics = await getMetrics(NOW);

    expect(metrics.weeks).toHaveLength(12);
    expect(metrics.weeks[0]).toEqual({
      start: "2026-09-28",
      activeMembers: 2,
      worldSeconds: 5400,
      posts: 1,
      comments: 0,
      reactions: 0,
      letters: 1,
      friendships: 1,
      gatherings: 0,
      calls: 0,
    });
    expect(metrics.weeks[1]).toMatchObject({ start: "2026-09-21", activeMembers: 1, posts: 1 });
    expect(metrics.weeks[11].start).toBe("2026-07-13");

    expect(metrics.trackingSince).toBe("2026-09-22");
    expect(metrics.optedOut).toBe(1);
    expect(metrics.cohorts.map((c) => [c.month, c.size])).toEqual([
      ["2026-09", 1],
      ["2026-08", 1],
    ]);
    // Ann joined in August, before anything was counted: a dash, not 0%.
    expect(metrics.cohorts[1].cells.slice(0, 3)).toEqual([
      { kind: "untracked" },
      { kind: "tracked", active: 1, percent: 100 },
      { kind: "future" },
    ]);
    expect(metrics.cohorts[0].cells[0]).toEqual({ kind: "tracked", active: 1, percent: 100 });
  });

  it("counts gatherings in the week they ended, never cancelled ones or their letters", async () => {
    const host = await joinedOn("2026-09-02T18:00:00Z");
    const guest = await joinedOn("2026-09-02T18:00:00Z");
    const gathering = (endsAt: string, status = "scheduled") =>
      prisma.gathering.create({
        data: {
          hostId: host,
          kind: "in_person",
          title: "Picnic",
          address: "The park",
          startsAt: new Date(new Date(endsAt).getTime() - 2 * 60 * 60 * 1000),
          endsAt: new Date(endsAt),
          status,
        },
        select: { id: true },
      });
    const held = await gathering("2026-09-29T20:00:00Z");
    await gathering("2026-09-29T21:00:00Z", "cancelled");
    // Ends 11 pm Sunday the 27th in Chicago, Monday in UTC: last week.
    await gathering("2026-09-28T04:00:00Z");
    await prisma.item.create({
      data: {
        ownerId: guest,
        fromId: host,
        kind: "note",
        location: "mailbox",
        slot: 0,
        body: "You're invited",
        placedAt: new Date("2026-09-29T15:00:00Z"),
        gatheringId: held.id,
      },
    });

    const metrics = await getMetrics(NOW);

    expect(metrics.weeks[0]).toMatchObject({ gatherings: 1, letters: 0 });
    expect(metrics.weeks[1]).toMatchObject({ gatherings: 1 });
  });

  it("counts calls in the week they started, with nobody's name attached", async () => {
    const caller = await joinedOn("2026-09-02T18:00:00Z");
    await prisma.call.create({
      data: { startedById: caller, startedAt: new Date("2026-09-29T20:00:00Z") },
    });
    // A month-old call, cleared of who started it, still counts.
    await prisma.call.create({
      data: {
        startedById: null,
        startedAt: new Date("2026-09-22T20:00:00Z"),
        endedAt: new Date("2026-09-22T21:00:00Z"),
      },
    });

    const metrics = await getMetrics(NOW);

    expect(metrics.weeks[0]).toMatchObject({ calls: 1 });
    expect(metrics.weeks[1]).toMatchObject({ calls: 1 });
  });

  it("shows empty weeks and no tracking date before anything is counted", async () => {
    await joinedOn("2026-09-02T18:00:00Z");

    const metrics = await getMetrics(NOW);

    expect(metrics.trackingSince).toBeNull();
    expect(metrics.weeks.every((w) => w.activeMembers === 0 && w.posts === 0)).toBe(true);
    expect(metrics.cohorts[0].cells[0]).toEqual({ kind: "untracked" });
  });
});
