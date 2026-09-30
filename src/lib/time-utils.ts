export function timeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
}

/** A short calendar date like "Sep 25" — for a row too small for a full
 * relative timestamp, e.g. one letter among a mailbox's twenty. */
export function shortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Sat, Oct 3, 12:00 PM to 3:00 PM", or both dates when it runs past a day,
 * in the viewer's own time zone. */
export function gatheringWhen(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const day: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  const time: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const startText = start.toLocaleString("en-US", { ...day, ...time });
  const sameDay = start.toDateString() === end.toDateString();
  const endText = end.toLocaleString("en-US", sameDay ? time : { ...day, ...time });
  return `${startText} to ${endText}`;
}
