// The mailbox color list — small enough to be its own module (like
// terrain-tint.ts's TINT_PRESETS) rather than living in world-model.ts, which
// would cycle: types.ts's WorldFixture needs MailboxColor, and world-model.ts
// already imports WorldFixture from types.ts. Both the engine and the server
// schemas (schemas.ts) import from here, and neither pulls in Prisma.

export type MailboxColor = "slate" | "green" | "blue";

export const MAILBOX_COLORS: readonly MailboxColor[] = ["slate", "green", "blue"];

export function isMailboxColor(value: unknown): value is MailboxColor {
  return typeof value === "string" && (MAILBOX_COLORS as readonly string[]).includes(value);
}
