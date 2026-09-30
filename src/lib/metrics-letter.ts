import type { Prisma } from "@/generated/prisma/client";

// Luke's letter about the admin metrics: what is counted, why, and how to opt
// out. It comes from Luke's own account rather than `ourplace`, because it is
// a personal heads-up about data, so it writes as "I".
//
// Existing members received it through the migration
// 20260930194100_metrics_letter, which carries this exact text as a SQL
// literal. metrics-letter.test.ts keeps the two identical: change both or neither.

/** The account every metrics letter is from. */
export const METRICS_LETTER_SENDER = "luke";

export const METRICS_LETTER = `Hi! It's Luke.

Quick heads-up about something new. I've started counting the days you visit Our Place, and how long the world stays open while you're in it. Only totals, never what you read or where you walked. Posts, comments, and letters get counted too, but those are already here as part of the site, so nothing new is being collected about them.

I'm doing this because I want to know whether Our Place is being used, and how. Collecting data points about traffic helps me do that.

If you'd rather not be counted, go to Account settings and turn on "Leave me out of activity counts." No questions, and I won't mind at all.

Thanks for being here.

Luke`;

/**
 * Leave the metrics letter in a brand-new member's mailbox, inside the
 * transaction that creates their account. The welcome letter takes slot 0 when
 * it is sent, so this one goes in the slot after it.
 */
export function leaveMetricsLetter(
  tx: Prisma.TransactionClient,
  recipientId: string,
  senderId: string,
  slot: number,
) {
  return tx.item.create({
    data: {
      ownerId: recipientId,
      kind: "note",
      location: "mailbox",
      slot,
      body: METRICS_LETTER,
      fromId: senderId,
      placedAt: new Date(),
    },
    select: { id: true },
  });
}
