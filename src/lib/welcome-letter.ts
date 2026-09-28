import type { Prisma } from "@/generated/prisma/client";

// The first letter every member finds in their island mailbox: how to keep Our
// Place on a home screen. It comes from the `ourplace` account, which speaks
// for the world itself, so it writes as "we".
//
// Existing members received it through the migration
// 20260928120000_welcome_letter, which carries this exact text as a SQL
// literal. welcome-letter.test.ts keeps the two identical: change both or neither.

/** The account every welcome letter is from. */
export const WELCOME_LETTER_SENDER = "ourplace";

export const WELCOME_LETTER = `Hello, friend. We are Our Place.

You found your mailbox. Good. Letters are how we like to talk.

You can keep us on your home screen, like an app. We open without the browser around us, so the world fills your whole screen.

iPhone or iPad (Safari): tap Share, then Add to Home Screen.
Android (Chrome): tap the menu, then Install app.
Laptop (Chrome or Edge): click the install icon at the right of the address bar. On a Mac in Safari: File, then Add to Dock.

The first time you open us from your home screen, sign in once more. Your place in the world is remembered separately there.

We will see you around.`;

/**
 * Leave the welcome letter in a brand-new member's mailbox, inside the
 * transaction that creates their account. A new mailbox is empty, so the
 * letter takes slot 0.
 */
export function leaveWelcomeLetter(
  tx: Prisma.TransactionClient,
  recipientId: string,
  senderId: string,
) {
  return tx.item.create({
    data: {
      ownerId: recipientId,
      kind: "note",
      location: "mailbox",
      slot: 0,
      body: WELCOME_LETTER,
      fromId: senderId,
      placedAt: new Date(),
    },
    select: { id: true },
  });
}
