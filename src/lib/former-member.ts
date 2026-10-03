// How a deleted account shows wherever something it left behind still names
// it: posts and comments left up, letters it sent, notices about gatherings it
// cancelled, the members it vouched for. Shared by the server (which writes
// the tombstone) and the client (which renders it without a profile link).

export const FORMER_MEMBER_NAME = "A former member";

const FORMER_PREFIX = "former-";

/** The tombstone's username: unique per account, and never a real name. */
export function formerMemberUsername(userId: string): string {
  return `${FORMER_PREFIX}${userId}`;
}

/** Whether a username belongs to a deleted account, so a page renders the
 * name as plain text instead of a link to a profile that no longer exists.
 * Real usernames can't contain this shape: they're 3 to 24 lowercase
 * letters, digits, and underscores, never a hyphen. */
export function isFormerMember(username: string | null | undefined): boolean {
  return typeof username === "string" && username.startsWith(FORMER_PREFIX);
}
