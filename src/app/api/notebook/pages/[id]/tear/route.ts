import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import {
  hasNotebook,
  firstFreeSlot,
  toPocketItem,
  isUniqueConstraintError,
  ITEM_SELECT,
} from "@/lib/pockets";
import type { Prisma } from "@/generated/prisma/client";

type TearOutcome =
  | {
      outcome: "torn";
      item: Prisma.ItemGetPayload<{ select: typeof ITEM_SELECT }>;
    }
  | { outcome: "not_found" }
  | { outcome: "pockets_full" };

// POST: tear a draft out of the Notebook. It stops being editable and
// becomes a Note item in the lowest free pocket slot; the draft is gone.
// Loading the draft, finding a slot, and moving the text all happen in one
// transaction so a draft is never lost without a Note landing in its place.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    if (!(await hasNotebook(auth.user.userId))) {
      return NextResponse.json({ error: "You don't have a notebook yet." }, { status: 403 });
    }

    const { id } = await params;

    try {
      const result = await prisma.$transaction(async (tx): Promise<TearOutcome> => {
        const draft = await tx.notebookPage.findUnique({
          where: { id },
          select: { ownerId: true, body: true },
        });
        if (!draft || draft.ownerId !== auth.user.userId) {
          return { outcome: "not_found" };
        }

        const slot = await firstFreeSlot(tx, auth.user.userId, "pocket");
        if (slot === null) {
          return { outcome: "pockets_full" };
        }

        const item = await tx.item.create({
          data: { id: uuidv4(), ownerId: auth.user.userId, kind: "note", slot, body: draft.body },
          select: ITEM_SELECT,
        });
        await tx.notebookPage.delete({ where: { id } });
        return { outcome: "torn", item };
      });

      if (result.outcome === "not_found") {
        return NextResponse.json({ error: "Draft not found." }, { status: 404 });
      }
      if (result.outcome === "pockets_full") {
        return NextResponse.json(
          { error: "Your pockets are full. Throw something away to make room for the note." },
          { status: 409 },
        );
      }
      return NextResponse.json({ message: "Torn out.", item: toPocketItem(result.item) });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return NextResponse.json(
          { error: "Something else just landed in that pocket. Try again." },
          { status: 409 },
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Tear notebook page error:", error);
    return NextResponse.json({ error: "Failed to tear that out." }, { status: 500 });
  }
}
