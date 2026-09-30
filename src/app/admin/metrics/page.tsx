import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthUser } from "@/lib/auth";
import { getMetrics, RETENTION_MONTHS, type Cohort, type WeekMetrics } from "@/lib/metrics";

// Admin only, checked on the server before any number is read. Totals only:
// nothing on this page names a member.

const thClass = "px-3 py-2 text-left text-xs font-semibold uppercase text-ink-muted";
const tdClass = "px-3 py-2 text-sm text-ink tabular-nums";

/** Seconds as "2 h 5 m", or "45 m" under an hour, so a short week still shows. */
function worldTime(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} m`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`;
}

const WEEK_COLUMNS: {
  key: Exclude<keyof WeekMetrics, "start">;
  label: string;
  format?: (value: number) => string;
  /** Counted only since visits were first recorded; earlier weeks show a dash, not 0. */
  visits?: true;
}[] = [
  { key: "activeMembers", label: "Active members", visits: true },
  { key: "worldSeconds", label: "World time", format: worldTime, visits: true },
  { key: "posts", label: "Posts" },
  { key: "comments", label: "Comments" },
  { key: "reactions", label: "Reactions" },
  { key: "letters", label: "Letters" },
  { key: "friendships", label: "New friends" },
];

/** "2026-09-28" as "Sep 28". The date is already a Chicago day, so format it in UTC. */
function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="op-card mt-6 rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{description}</p>
      <div className="mt-4 overflow-x-auto">{children}</div>
    </section>
  );
}

/** True when the whole week ended before the first visit was recorded. */
function beforeTracking(weekStart: string, trackingSince: string | null): boolean {
  if (!trackingSince) return true;
  const nextWeek = new Date(`${weekStart}T00:00:00Z`);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  return nextWeek.toISOString().slice(0, 10) <= trackingSince;
}

function WeeklyTable({
  weeks,
  trackingSince,
}: {
  weeks: WeekMetrics[];
  trackingSince: string | null;
}) {
  return (
    <table className="w-full min-w-[40rem] border-collapse">
      <thead>
        <tr className="border-b border-line">
          <th className={thClass}>Week of</th>
          {WEEK_COLUMNS.map((c) => (
            <th key={c.key} className={`${thClass} text-right`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((w) => (
          <tr key={w.start} className="border-b border-line-soft">
            <td className={`${tdClass} whitespace-nowrap`}>{shortDay(w.start)}</td>
            {WEEK_COLUMNS.map((c) => (
              <td key={c.key} className={`${tdClass} whitespace-nowrap text-right`}>
                {c.visits && beforeTracking(w.start, trackingSince) ? (
                  <span className="text-ink-faint">—</span>
                ) : c.format ? (
                  c.format(w[c.key])
                ) : (
                  w[c.key]
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RetentionTable({ cohorts }: { cohorts: Cohort[] }) {
  if (cohorts.length === 0) return <p className="text-sm text-ink-faint">No members yet.</p>;
  return (
    <table className="w-full min-w-[48rem] border-collapse">
      <thead>
        <tr className="border-b border-line">
          <th className={thClass}>Joined</th>
          <th className={`${thClass} text-right`}>Members</th>
          {Array.from({ length: RETENTION_MONTHS }, (_, i) => (
            <th key={i} className={`${thClass} text-right`}>
              {i === 0 ? "Month 0" : `+${i}`}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cohorts.map((c) => (
          <tr key={c.month} className="border-b border-line-soft">
            <td className={`${tdClass} whitespace-nowrap`}>{monthLabel(c.month)}</td>
            <td className={`${tdClass} text-right`}>{c.size}</td>
            {c.cells.map((cell, i) => (
              <td key={i} className={`${tdClass} whitespace-nowrap text-right`}>
                {cell.kind === "tracked" && (
                  <>
                    {cell.percent}% <span className="text-xs text-ink-faint">({cell.active})</span>
                  </>
                )}
                {cell.kind === "untracked" && <span className="text-ink-faint">—</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function AdminMetricsPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/auth/login");
  if (auth.role !== "admin") redirect("/feed");

  const { weeks, cohorts, optedOut, trackingSince } = await getMetrics();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm font-medium text-accent-600 hover:underline">
        ← Admin
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-ink">Metrics</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Totals only, never what anyone read or where they walked. Days and weeks follow Chicago
        time; weeks start on Monday.{" "}
        {trackingSince
          ? `Visits have been counted since ${shortDay(trackingSince)}.`
          : "No visits have been counted yet."}
      </p>

      <Section
        title="Each week"
        description="Newest week first. Active members signed in at least once that week. World time adds up visits to the world that ended that week, each capped at 3 hours. A dash means the week ended before visits were counted. Posts, comments, reactions, letters sent between members, and friend requests later accepted (by the week they were sent) include everyone."
      >
        <WeeklyTable weeks={weeks} trackingSince={trackingSince} />
      </Section>

      <Section
        title="Retention by month joined"
        description="For members who joined in each month: the share who signed in at least once in the month they joined, and in each month after. A dash means that month ended before visits were counted. Members who opted out aren't included."
      >
        <RetentionTable cohorts={cohorts} />
      </Section>

      <Section
        title="Left out of the counts"
        description={'Members who turned on "Leave me out of activity counts" in Account settings.'}
      >
        <p className="text-2xl font-bold text-ink tabular-nums">{optedOut}</p>
      </Section>
    </div>
  );
}
