import type { PollWire } from "@/lib/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** "In 2 days", "in 5 hours", or "in under an hour", for a time still ahead. */
function closesIn(msLeft: number): string {
  if (msLeft < HOUR_MS) return "closes in under an hour";
  if (msLeft < DAY_MS) return `closes in ${plural(Math.floor(msLeft / HOUR_MS), "hour")}`;
  return `closes in ${plural(Math.floor(msLeft / DAY_MS), "day")}`;
}

/** The line under a poll: "3 votes · closes in 2 days", "3 votes · closed". */
export function pollFooter(poll: PollWire, nowMs: number): string {
  const votes = plural(poll.total_votes, "vote");
  if (poll.closed) return `${votes} · closed`;
  if (!poll.closes_at) return votes;
  return `${votes} · ${closesIn(new Date(poll.closes_at).getTime() - nowMs)}`;
}

/** The hint under a poll whose results aren't showing yet, or null. */
export function pollHint(poll: PollWire): string | null {
  if (poll.show_results) return null;
  if (poll.results_visible === "after_close") return "Results show when the poll closes";
  return "Results show after you vote";
}

/** A whole-number share of the votes, for an option's bar. */
export function pollPercent(voteCount: number, totalVotes: number): number {
  return totalVotes === 0 ? 0 : Math.round((voteCount / totalVotes) * 100);
}
