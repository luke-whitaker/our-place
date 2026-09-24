import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { itemsLimiter } from "@/lib/rate-limit";
import { notebookPageSchema, getZodErrorMessage } from "@/lib/schemas";
import { hasNotebook } from "@/lib/pockets";

function tooManyRequests(retryAfterMs: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
  );
}

// PATCH: edit one of the caller's own drafts.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const limit = itemsLimiter.check(auth.user.userId);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);

    if (!(await hasNotebook(auth.user.userId))) {
      return NextResponse.json({ error: "You don't have a notebook yet." }, { status: 403 });
    }

    const body = await request.json();
    const parsed = notebookPageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    const { id } = await params;
    const existing = await prisma.notebookPage.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!existing || existing.ownerId !== auth.user.userId) {
      return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    }

    const updated = await prisma.notebookPage.update({
      where: { id },
      data: { body: parsed.data.body },
      select: { id: true, page: true, body: true, updatedAt: true },
    });

    return NextResponse.json({
      message: "Saved.",
      page: {
        id: updated.id,
        page: updated.page,
        body: updated.body,
        updated_at: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Update notebook page error:", error);
    return NextResponse.json({ error: "Failed to save your draft." }, { status: 500 });
  }
}

// DELETE: crumple up one of the caller's own drafts.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const limit = itemsLimiter.check(auth.user.userId);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);

    if (!(await hasNotebook(auth.user.userId))) {
      return NextResponse.json({ error: "You don't have a notebook yet." }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.notebookPage.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!existing || existing.ownerId !== auth.user.userId) {
      return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    }

    await prisma.notebookPage.delete({ where: { id } });

    return NextResponse.json({ message: "Crumpled up." });
  } catch (error) {
    console.error("Delete notebook page error:", error);
    return NextResponse.json({ error: "Failed to crumple that draft." }, { status: 500 });
  }
}
