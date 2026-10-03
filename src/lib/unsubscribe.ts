// Unsubscribe links for gathering emails. The token is `userId.mac`, an HMAC
// of the member's id and this one purpose, so it works without signing in,
// can't be forged for someone else, and can't be reused for anything but
// turning gathering emails off. It never expires: an old email's link should
// still work. Rotating JWT_SECRET voids every link, which is acceptable,
// since Account settings has the same switch.

import crypto from "crypto";
import { getServerSecret } from "@/lib/server-secret";

const PURPOSE = "unsubscribe-gatherings";

function mac(userId: string): string {
  return crypto
    .createHmac("sha256", getServerSecret())
    .update(`${PURPOSE}:${userId}`)
    .digest("hex");
}

export function signUnsubscribeToken(userId: string): string {
  return `${userId}.${mac(userId)}`;
}

/** The member a token belongs to, or null if it was altered or made up. */
export function verifyUnsubscribeToken(token: string): string | null {
  const [userId, given, extra] = token.split(".");
  if (!userId || !given || extra !== undefined) return null;
  const expected = Buffer.from(mac(userId));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length) return null;
  return crypto.timingSafeEqual(actual, expected) ? userId : null;
}
