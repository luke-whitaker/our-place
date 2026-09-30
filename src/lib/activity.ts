// Recording what the admin metrics count: which days a member signed in, and
// how long the world stayed open for them. One activity_days row per member
// per day, nothing about what they read or where they walked. Members who
// turned on "Leave me out of activity counts" are never written, and neither
// is the `ourplace` account, which is the world rather than a member.

import prisma from "@/lib/db";

/** Days are counted in Luke's time zone, so an evening visit lands on that evening's day. */
export const METRICS_TIME_ZONE = "America/Chicago";

/** The account that speaks for the world. It never counts as a member. */
export const WORLD_ACCOUNT = "ourplace";

/** How long activity rows are kept: a little over a year, enough for 12-month retention. */
export const ACTIVITY_RETENTION_DAYS = 400;

const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: METRICS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Chicago calendar day an instant falls on, as "YYYY-MM-DD". */
export function metricsDay(at: Date): string {
  return DAY_FORMAT.format(at);
}

/** A "YYYY-MM-DD" day as the Date Prisma stores in a DATE column (UTC midnight). */
export function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export interface MetricsSubject {
  id: string;
  username: string;
  excludeFromMetrics: boolean;
}

export function isCounted(user: MetricsSubject): boolean {
  return !user.excludeFromMetrics && user.username !== WORLD_ACCOUNT;
}

// Who already has today's row, so a signed-in member costs one write a day
// rather than one per request. Bounded by the number of members, and cleared
// when the Chicago day changes. Lost on a restart, which only costs one
// redundant insert per member.
let recordedDay = "";
const recordedToday = new Set<string>();

/**
 * Mark today as active for a signed-in member. Never throws: the promise
 * resolves after logging any failure, because a metrics write must never fail
 * the request that triggered it. Callers `void` it.
 */
export async function recordVisit(user: MetricsSubject, at = new Date()): Promise<void> {
  if (!isCounted(user)) return;
  const day = metricsDay(at);
  if (day !== recordedDay) {
    recordedDay = day;
    recordedToday.clear();
    await pruneActivity(at);
  }
  if (recordedToday.has(user.id)) return;
  recordedToday.add(user.id);
  try {
    await prisma.activityDay.createMany({
      data: [{ userId: user.id, day: dayToDate(day) }],
      skipDuplicates: true,
    });
  } catch (error) {
    // Forget the member so the next request tries again.
    recordedToday.delete(user.id);
    console.error("Failed to record a visit:", error);
  }
}

/** Delete rows past the retention window. Runs once a day, from recordVisit. */
async function pruneActivity(at: Date): Promise<void> {
  const cutoff = dayToDate(metricsDay(at));
  cutoff.setUTCDate(cutoff.getUTCDate() - ACTIVITY_RETENTION_DAYS);
  try {
    await prisma.activityDay.deleteMany({ where: { day: { lt: cutoff } } });
  } catch (error) {
    console.error("Failed to prune activity rows:", error);
  }
}

/**
 * Add a finished world visit to the member's row for the day it ended. Called
 * by the presence hub when a member leaves the world. Never throws, like
 * recordVisit. Ghost Mode still counts: it hides a member from other members,
 * not from totals.
 */
export async function recordWorldTime(
  userId: string,
  seconds: number,
  at = new Date(),
): Promise<void> {
  if (seconds <= 0) return;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, excludeFromMetrics: true },
    });
    if (!user || !isCounted(user)) return;
    const day = dayToDate(metricsDay(at));
    await prisma.activityDay.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, worldSeconds: seconds },
      update: { worldSeconds: { increment: seconds } },
    });
  } catch (error) {
    console.error("Failed to record world time:", error);
  }
}

/**
 * Forget that a member was recorded today. Opting out deletes their rows, so
 * without this, opting back in the same day would never write today's row.
 */
export function forgetVisit(userId: string): void {
  recordedToday.delete(userId);
}

/** Test hook: forget which members were recorded today. */
export function resetVisitRecorder(): void {
  recordedDay = "";
  recordedToday.clear();
}
