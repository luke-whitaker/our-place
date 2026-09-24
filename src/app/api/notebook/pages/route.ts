import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { notebookPageSchema, getZodErrorMessage } from "@/lib/schemas";
import { NOTEBOOK_PAGES } from "@/lib/items";
import { hasNotebook, isUniqueConstraintError } from "@/lib/pockets";
import type { NotebookPageDraft } from "@/lib/types";

/** Just enough of a notebook_pages row to map onto the wire shape. */
function toDraft(row: {
  id: string;
  page: number;
  body: string;
  updatedAt: Date;
}): NotebookPageDraft {
  return { id: row.id, page: row.page, body: row.body, updated_at: row.updatedAt.toISOString() };
}

// GET: the caller's drafts, in page order.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    if (!(await hasNotebook(auth.user.userId))) {
      return NextResponse.json({ error: "You don't have a notebook yet." }, { status: 403 });
    }

    const pages = await prisma.notebookPage.findMany({
      where: { ownerId: auth.user.userId },
      select: { id: true, page: true, body: true, updatedAt: true },
      orderBy: { page: "asc" },
    });

    return NextResponse.json({ pages: pages.map(toDraft) });
  } catch (error) {
    console.error("Notebook pages error:", error);
    return NextResponse.json({ error: "Failed to load your notebook." }, { status: 500 });
  }
}

/** The lowest unused page (0-9) for `ownerId`, or null once all 10 are
 * taken — the bound `@@unique([ownerId, page])` enforces at the database
 * level. Only POST needs this, so it stays local rather than joining the
 * shared pocket-slot helper. */
async function firstFreePage(
  tx: Prisma.TransactionClient,
  ownerId: string,
): Promise<number | null> {
  const occupied = await tx.notebookPage.findMany({
    where: { ownerId },
    select: { page: true },
  });
  const taken = new Set(occupied.map((p) => p.page));
  for (let page = 0; page < NOTEBOOK_PAGES; page++) {
    if (!taken.has(page)) return page;
  }
  return null;
}

// POST: write a new draft into the lowest free page.
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const parsed = notebookPageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const page = await firstFreePage(tx, auth.user.userId);
        if (page === null) return null;
        return tx.notebookPage.create({
          data: { id: uuidv4(), ownerId: auth.user.userId, page, body: parsed.data.body },
          select: { id: true, page: true, body: true, updatedAt: true },
        });
      });

      if (!created) {
        return NextResponse.json(
          {
            error: "Your notebook has 10 drafts. Tear one out or crumple one up to make room.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json({ message: "Saved.", page: toDraft(created) }, { status: 201 });
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
    console.error("Create notebook page error:", error);
    return NextResponse.json({ error: "Failed to save your draft." }, { status: 500 });
  }
}
