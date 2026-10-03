// The numbers on the admin metrics page. Everything is a total: weekly counts,
// and retention by the month members joined. Days and weeks are Chicago days
// (METRICS_TIME_ZONE), weeks start on Monday, and the `ourplace` account never
// counts as a member.

import prisma from "@/lib/db";
import { METRICS_TIME_ZONE, WORLD_ACCOUNT, dayToDate, metricsDay } from "@/lib/activity";
import { METRICS_LETTER } from "@/lib/metrics-letter";

export const METRICS_WEEKS = 12;
/** Retention shows this many join months and this many months after joining. */
export const RETENTION_MONTHS = 12;

export interface WeekMetrics {
  /** The Monday the week starts, "YYYY-MM-DD". */
  start: string;
  activeMembers: number;
  worldSeconds: number;
  posts: number;
  comments: number;
  reactions: number;
  letters: number;
  friendships: number;
  /** Gatherings, not cancelled, that ended that week. */
  gatherings: number;
}

export type RetentionCell =
  | { kind: "tracked"; active: number; percent: number }
  /** A month that ended before the first activity was recorded. */
  | { kind: "untracked" }
  /** A month that hasn't happened yet. */
  | { kind: "future" };

export interface Cohort {
  /** The month these members joined, "YYYY-MM". */
  month: string;
  size: number;
  cells: RetentionCell[];
}

export interface Metrics {
  weeks: WeekMetrics[];
  cohorts: Cohort[];
  optedOut: number;
  /** Blocks in place right now. A count only: who blocked whom is never shown. */
  activeBlocks: number;
  /** The first day with any activity row, or null before anything was recorded. */
  trackingSince: string | null;
}

function addDays(day: string, days: number): string {
  const d = dayToDate(day);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Mondays of the last `count` weeks up to `today`, newest first. */
export function weekStarts(today: string, count: number): string[] {
  const sinceMonday = (dayToDate(today).getUTCDay() + 6) % 7;
  const thisMonday = addDays(today, -sinceMonday);
  return Array.from({ length: count }, (_, i) => addDays(thisMonday, -7 * i));
}

/** "YYYY-MM" plus `months`. */
export function addMonths(month: string, months: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * Retention cells for each join month. A month counts a member as retained if
 * they had any active day in it. Months that ended before tracking began show
 * as untracked rather than 0%, because nobody could have been counted then.
 */
export function buildRetention(
  members: { id: string; joinMonth: string }[],
  activeMonths: Map<string, Set<string>>,
  trackingSince: string | null,
  currentMonth: string,
): Cohort[] {
  const firstTrackedMonth = trackingSince?.slice(0, 7) ?? null;
  const byMonth = new Map<string, string[]>();
  for (const m of members) byMonth.set(m.joinMonth, [...(byMonth.get(m.joinMonth) ?? []), m.id]);

  return [...byMonth.keys()]
    .sort()
    .reverse()
    .slice(0, RETENTION_MONTHS)
    .map((month) => {
      const ids = byMonth.get(month) ?? [];
      const cells = Array.from({ length: RETENTION_MONTHS }, (_, offset): RetentionCell => {
        const at = addMonths(month, offset);
        if (at > currentMonth) return { kind: "future" };
        if (firstTrackedMonth === null || at < firstTrackedMonth) return { kind: "untracked" };
        const active = ids.filter((id) => activeMonths.get(at)?.has(id)).length;
        return { kind: "tracked", active, percent: Math.round((active / ids.length) * 100) };
      });
      return { month, size: ids.length, cells };
    });
}

interface WeekCountRow {
  kind: string;
  week: Date;
  count: number;
}

/** Posts, comments, reactions, letters, and accepted friendships per Chicago week. */
async function contentByWeek(firstWeek: string): Promise<WeekCountRow[]> {
  // A day early in UTC, so the index narrows the scan without cutting off the
  // first Chicago morning; the outer filter is exact.
  const since = dayToDate(addDays(firstWeek, -1));
  const tz = METRICS_TIME_ZONE;
  // Letters are items someone placed in a mailbox. The welcome letter comes
  // from `ourplace`, Luke's metrics letter went to everyone at once, and
  // gathering invitations are counted as gatherings, so none of them count
  // as members writing to each other. A gathering counts in the week it ended,
  // so a cancelled one never does.
  return prisma.$queryRaw<WeekCountRow[]>`
    SELECT kind, week, count(*)::int AS count FROM (
      SELECT 'posts' AS kind, date_trunc('week', created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date AS week
        FROM posts WHERE created_at >= ${since}
      UNION ALL
      SELECT 'comments', date_trunc('week', created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date
        FROM comments WHERE created_at >= ${since}
      UNION ALL
      SELECT 'reactions', date_trunc('week', created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date
        FROM reactions WHERE created_at >= ${since}
      UNION ALL
      SELECT 'letters', date_trunc('week', i.placed_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date
        FROM items i JOIN users s ON s.id = i.from_id
        WHERE i.placed_at >= ${since} AND s.username <> ${WORLD_ACCOUNT}
          AND i.body IS DISTINCT FROM ${METRICS_LETTER} AND i.gathering_id IS NULL
      UNION ALL
      SELECT 'friendships', date_trunc('week', created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date
        FROM friendships WHERE status = 'accepted' AND created_at >= ${since}
      UNION ALL
      SELECT 'gatherings', date_trunc('week', ends_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date
        FROM gatherings WHERE status <> 'cancelled' AND ends_at >= ${since}
    ) counted
    WHERE week >= ${dayToDate(firstWeek)}
    GROUP BY kind, week`;
}

async function activityByWeek(firstWeek: string) {
  return prisma.$queryRaw<{ week: Date; members: number; seconds: number }[]>`
    SELECT date_trunc('week', day::timestamp)::date AS week,
           count(DISTINCT user_id)::int AS members,
           coalesce(sum(world_seconds), 0)::int AS seconds
    FROM activity_days WHERE day >= ${dayToDate(firstWeek)}
    GROUP BY 1`;
}

async function weeklyMetrics(today: string): Promise<WeekMetrics[]> {
  const starts = weekStarts(today, METRICS_WEEKS);
  const firstWeek = starts[starts.length - 1];
  const [activity, content] = await Promise.all([
    activityByWeek(firstWeek),
    contentByWeek(firstWeek),
  ]);
  const key = (d: Date) => d.toISOString().slice(0, 10);
  return starts.map((start) => {
    const a = activity.find((r) => key(r.week) === start);
    const count = (kind: string) =>
      content.find((r) => r.kind === kind && key(r.week) === start)?.count ?? 0;
    return {
      start,
      activeMembers: a?.members ?? 0,
      worldSeconds: a?.seconds ?? 0,
      posts: count("posts"),
      comments: count("comments"),
      reactions: count("reactions"),
      letters: count("letters"),
      friendships: count("friendships"),
      gatherings: count("gatherings"),
    };
  });
}

async function retention(today: string) {
  const [users, active, first] = await Promise.all([
    // Opted-out members have no activity rows, so counting them would read as
    // members who left; they're out of retention entirely.
    prisma.user.findMany({
      where: { username: { not: WORLD_ACCOUNT }, excludeFromMetrics: false },
      select: { id: true, createdAt: true },
    }),
    prisma.$queryRaw<{ user_id: string; month: string }[]>`
      SELECT DISTINCT user_id, to_char(day, 'YYYY-MM') AS month FROM activity_days`,
    prisma.activityDay.findFirst({ orderBy: { day: "asc" }, select: { day: true } }),
  ]);
  const activeMonths = new Map<string, Set<string>>();
  for (const row of active) {
    activeMonths.set(row.month, (activeMonths.get(row.month) ?? new Set()).add(row.user_id));
  }
  const trackingSince = first ? first.day.toISOString().slice(0, 10) : null;
  const members = users.map((u) => ({ id: u.id, joinMonth: metricsDay(u.createdAt).slice(0, 7) }));
  return {
    cohorts: buildRetention(members, activeMonths, trackingSince, today.slice(0, 7)),
    trackingSince,
  };
}

export async function getMetrics(now = new Date()): Promise<Metrics> {
  const today = metricsDay(now);
  const [weeks, { cohorts, trackingSince }, optedOut, activeBlocks] = await Promise.all([
    weeklyMetrics(today),
    retention(today),
    prisma.user.count({ where: { excludeFromMetrics: true, username: { not: WORLD_ACCOUNT } } }),
    prisma.block.count(),
  ]);
  return { weeks, cohorts, optedOut, activeBlocks, trackingSince };
}
