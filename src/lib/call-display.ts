// Pure pieces of the voice call UI: how often to poll, what an invitation
// says, and the order people are listed in. Kept apart from the components so
// they're tested without a browser.

import { MAX_CALL_SIZE, type CallInvitation, type CallMember } from "@/lib/types";

/** How often a page asks GET /api/calls/current while it matters: when
 * connected to a call (the poll is its heartbeat, which the server counts as
 * gone after 45 seconds) or while the tab is showing. */
export const CALL_POLL_MS = 10_000;
/** How often a hidden tab that isn't in a call looks for invitations. */
export const CALL_POLL_HIDDEN_MS = 60_000;
/** The longest wait after failed polls. While connected, the heartbeat must
 * still land well inside the server's 45 seconds, so the cap is lower. */
export const CALL_POLL_BACKOFF_MAX_MS = 60_000;
export const CALL_POLL_BACKOFF_MAX_CONNECTED_MS = 20_000;
/** How long an invitation's toast stays up before it tucks itself away. */
export const INVITE_TOAST_MS = 30_000;

/** The wait before the next poll. Failures double the wait, up to a cap, so a
 * server that's down isn't asked six times a minute by every open tab. */
export function pollDelay(opts: { connected: boolean; hidden: boolean; failures: number }): number {
  const base = opts.connected || !opts.hidden ? CALL_POLL_MS : CALL_POLL_HIDDEN_MS;
  if (opts.failures <= 0) return base;
  const cap = opts.connected ? CALL_POLL_BACKOFF_MAX_CONNECTED_MS : CALL_POLL_BACKOFF_MAX_MS;
  // The exponent is capped too, so a long outage can't overflow the number.
  return Math.min(cap, Math.max(base, CALL_POLL_MS * 2 ** Math.min(opts.failures, 6)));
}

/** "Sam", "Sam and Robin", "Sam, Robin, and Ada", or "Sam, Robin, and 2 others". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
  return `${names[0]}, ${names[1]}, and ${names.length - 2} others`;
}

/** What an invitation's toast says: "Luke is calling, with Sam. Join?" */
export function inviteToastText(invitation: CallInvitation): string {
  const caller = invitation.invited_by;
  const others = invitation.joined
    .filter((p) => p.username !== caller?.username)
    .map((p) => p.display_name);
  if (!caller) {
    return others.length > 0
      ? `A call with ${listNames(others)} is going. Join?`
      : "Join the call?";
  }
  const company = others.length > 0 ? `, with ${listNames(others)}` : "";
  return `${caller.display_name} is calling${company}. Join?`;
}

/** The call's people as the controls list them: you first, then everyone in
 * the call by name, then those still invited. */
export function orderMembers(members: CallMember[], selfUsername: string): CallMember[] {
  const rank = (m: CallMember) => (m.username === selfUsername ? 0 : m.status === "joined" ? 1 : 2);
  return [...members].sort(
    (a, b) => rank(a) - rank(b) || a.display_name.localeCompare(b.display_name),
  );
}

/** How many more people a call has room for, counting open invitations. */
export function roomLeft(members: CallMember[]): number {
  return Math.max(0, MAX_CALL_SIZE - members.length);
}
