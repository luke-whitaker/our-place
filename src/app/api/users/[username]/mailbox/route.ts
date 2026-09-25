import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { leaveLetterSchema, getZodErrorMessage } from "@/lib/schemas";
import { isItemKind, ITEM_CATALOG } from "@/lib/items";
import { firstFreeSlot, isUniqueConstraintError } from "@/lib/pockets";
import { requireIslandAccess } from "@/lib/islands";

// GET: whether a member's mailbox holds any mail — the flag the world shows
// on the mailbox — visible to anyone the island gate lets visit, the owner
// included.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { username } = await params;

    const gate = await requireIslandAccess(auth.user.userId, username);
    if (gate.error) return gate.error;

    const letter = await prisma.item.findFirst({
      where: { ownerId: gate.owner.id, location: "mailbox" },
      select: { id: true },
    });

    return NextResponse.json({ has_mail: letter !== null });
  } catch (error) {
    console.error("Mailbox status error:", error);
    return NextResponse.json({ error: "Failed to check that mailbox." }, { status: 500 });
  }
}

type LeaveOutcome = "moved" | "mailbox_full" | "item_gone";

// POST: leave a torn-out Note from the caller's pockets in a member's
// mailbox. Dropping it MOVES the item — its owner becomes the mailbox's
// owner — it is never copied.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const limit = itemsLimiter.check(auth.user.userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const { username } = await params;
    const body = await request.json();
    const parsed = leaveLetterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    if (auth.user.username.toLowerCase() === username.toLowerCase()) {
      return NextResponse.json(
        { error: "That's your own mailbox. Visit a friend's island to leave them a letter." },
        { status: 400 },
      );
    }

    const gate = await requireIslandAccess(auth.user.userId, username);
    if (gate.error) return gate.error;

    const item = await prisma.item.findUnique({
      where: { id: parsed.data.item_id },
      select: { id: true, ownerId: true, kind: true, location: true },
    });
    if (!item || item.ownerId !== auth.user.userId || item.location !== "pocket") {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }
    // A row's kind always comes from our own catalog — an unrecognized value
    // means the database and the catalog have drifted, which the outer catch
    // turns into a 500 rather than silently treating it as mailable.
    if (!isItemKind(item.kind)) {
      throw new Error(`Unknown item kind "${item.kind}" on item ${item.id}`);
    }
    if (!ITEM_CATALOG[item.kind].mailable) {
      return NextResponse.json({ error: "Only notes fit in a mailbox." }, { status: 400 });
    }

    try {
      const outcome = await prisma.$transaction(async (tx): Promise<LeaveOutcome> => {
        const slot = await firstFreeSlot(tx, gate.owner.id, "mailbox");
        if (slot === null) return "mailbox_full";

        // Guarded write: only moves the item if it's still the sender's and
        // still in their pockets, so a concurrent double-send can't move it
        // twice. The `@@unique([ownerId, location, slot])` constraint is
        // what actually stops two senders claiming the same mailbox slot —
        // caught below as a P2002.
        const moved = await tx.item.updateMany({
          where: { id: item.id, ownerId: auth.user.userId, location: "pocket" },
          data: {
            ownerId: gate.owner.id,
            location: "mailbox",
            slot,
            fromId: auth.user.userId,
            placedAt: new Date(),
          },
        });
        return moved.count === 1 ? "moved" : "item_gone";
      });

      if (outcome === "mailbox_full") {
        return NextResponse.json(
          { error: `${gate.owner.displayName}'s mailbox is full.` },
          { status: 409 },
        );
      }
      if (outcome === "item_gone") {
        return NextResponse.json({ error: "Item not found." }, { status: 404 });
      }

      return NextResponse.json({ message: "Letter left.", has_mail: true });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return NextResponse.json(
          { error: "Someone else just left a letter there. Try again." },
          { status: 409 },
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Leave letter error:", error);
    return NextResponse.json({ error: "Failed to leave that letter." }, { status: 500 });
  }
}
