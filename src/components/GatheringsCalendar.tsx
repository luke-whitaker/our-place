"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, userMessage } from "@/lib/api-client";
import { gatheringWhen } from "@/lib/time-utils";
import { useAuth } from "@/components/AuthProvider";
import type { GatheringCalendar, GatheringEntry } from "@/lib/types";

/** A month grid always shows six weeks, Sunday first. */
const GRID_DAYS = 42;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Titles a day cell spells out on a wide screen before "+N more". */
const TITLES_PER_DAY = 2;

interface GatheringsCalendarProps {
  /** A community's slug for its calendar; omitted for the member's own. */
  community?: string;
  /** The line under the heading saying exactly what this calendar shows. */
  description: string;
  hostHref: string;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** The Sunday on or before the first of `month`, local time. */
function gridStart(month: Date): Date {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  return addDays(first, -first.getDay());
}

/** Gatherings that overlap one local calendar day. */
function onDay(gatherings: GatheringEntry[], day: Date): GatheringEntry[] {
  const next = addDays(day, 1).getTime();
  return gatherings.filter(
    (g) => new Date(g.starts_at).getTime() < next && new Date(g.ends_at).getTime() > day.getTime(),
  );
}

function answerLabel(entry: GatheringEntry, viewerIsHost: boolean): string {
  if (viewerIsHost) return "Hosting";
  if (entry.my_response === "accepted") return "Going";
  if (entry.my_response === "declined") return "Declined";
  return "Invited";
}

/**
 * <GatheringsCalendar /> — a month of gatherings plus an Upcoming list, for a
 * community page (its members only) or a member's own My Place (only them).
 * The server decides which gatherings each one holds; this only lays them out
 * in the viewer's own time zone.
 */
export default function GatheringsCalendar({
  community,
  description,
  hostHref,
}: GatheringsCalendarProps) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendar, setCalendar] = useState<GatheringCalendar | null>(null);
  const [error, setError] = useState("");
  const viewer = useAuth().user?.username ?? null;

  useEffect(() => {
    let cancelled = false;
    const from = gridStart(month);
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: addDays(from, GRID_DAYS).toISOString(),
    });
    if (community) params.set("community", community);
    void (async () => {
      try {
        const data = await apiFetch<GatheringCalendar>(`/api/gatherings/calendar?${params}`);
        if (!cancelled) {
          setCalendar(data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(userMessage(err, "Couldn't load the calendar."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month, community]);

  const start = gridStart(month);
  const days = Array.from({ length: GRID_DAYS }, (_, i) => addDays(start, i));
  const today = new Date().toDateString();
  const gatherings = calendar?.gatherings ?? [];

  return (
    <section className="op-card rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink">Gatherings</h2>
          <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
        </div>
        <Link
          href={hostHref}
          className="rounded-xl bg-accent-500 px-4 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-accent-600"
        >
          Host a gathering
        </Link>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-secondary hover:bg-surface-emphasis"
          aria-label="Previous month"
        >
          ←
        </button>
        <h3 className="text-sm font-semibold text-ink">
          {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h3>
        <button
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-secondary hover:bg-surface-emphasis"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-3 grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="bg-surface-emphasis py-1 text-center text-xs font-medium text-ink-muted"
          >
            {d}
          </div>
        ))}
        {days.map((day) => {
          const here = onDay(gatherings, day);
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = day.toDateString() === today;
          return (
            <div
              key={day.toISOString()}
              className={`min-h-12 p-1 sm:min-h-20 ${inMonth ? "bg-surface" : "bg-surface-emphasis"}`}
            >
              <p
                className={`text-xs ${isToday ? "inline-block rounded-full bg-accent-500 px-1.5 font-bold text-ink-inverse" : inMonth ? "text-ink-tertiary" : "text-ink-faint"}`}
              >
                {day.getDate()}
              </p>
              {/* Phones get a dot per gathering; the Upcoming list below names them. */}
              <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                {here.slice(0, 3).map((g) => (
                  <Link
                    key={g.id}
                    href={`/gatherings/${g.id}`}
                    aria-label={g.title}
                    className="h-2 w-2 rounded-full bg-accent-500"
                  />
                ))}
              </div>
              <div className="mt-1 hidden space-y-0.5 sm:block">
                {here.slice(0, TITLES_PER_DAY).map((g) => (
                  <Link
                    key={g.id}
                    href={`/gatherings/${g.id}`}
                    title={g.title}
                    className="block truncate rounded bg-accent-50 px-1 text-xs text-accent-600 hover:bg-accent-100"
                  >
                    {g.title}
                  </Link>
                ))}
                {here.length > TITLES_PER_DAY && (
                  <p className="px-1 text-xs text-ink-faint">
                    +{here.length - TITLES_PER_DAY} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="mt-5 text-sm font-semibold text-ink">Upcoming</h3>
      {calendar && calendar.upcoming.length === 0 && (
        <p className="mt-1 text-sm text-ink-muted">Nothing planned yet.</p>
      )}
      <ul className="mt-2 divide-y divide-line-soft">
        {calendar?.upcoming.map((g) => (
          <li key={g.id} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <Link
                href={`/gatherings/${g.id}`}
                className="block break-words text-sm font-medium text-ink hover:text-accent-600"
              >
                {g.title}
              </Link>
              <p className="text-xs text-ink-muted">
                {gatheringWhen(g.starts_at, g.ends_at)}
                {!community && g.community ? ` · ${g.community.name}` : ""} · hosted by{" "}
                {g.host.display_name}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-ink-secondary">
              {answerLabel(g, g.host.username === viewer)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
