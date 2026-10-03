import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getClientIp, unsubscribeLimiter } from "@/lib/rate-limit";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

// POST ?token=: turn gathering emails off, without signing in. The signed
// token in the link names the member. Only POST changes anything: mail
// scanners follow GET links, so the page at /unsubscribe asks first and
// posts here, and mail apps' own unsubscribe button posts here directly
// (RFC 8058 one-click, from the List-Unsubscribe headers). The body they send
// ("List-Unsubscribe=One-Click") carries nothing we need, so it isn't read.
export async function POST(request: NextRequest) {
  try {
    const limit = unsubscribeLimiter.check(getClientIp(request));
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const token = request.nextUrl.searchParams.get("token") ?? "";
    const userId = token.length <= 200 ? verifyUnsubscribeToken(token) : null;
    if (!userId) {
      return NextResponse.json(
        { error: "That unsubscribe link isn't valid. You can turn emails off in Account settings." },
        { status: 400 },
      );
    }

    // A deleted account has nothing left to turn off; answer the same way.
    await prisma.user.updateMany({
      where: { id: userId, deletedAt: null },
      data: { emailGatherings: false },
    });
    return NextResponse.json({
      message: "You won't get emails about gatherings anymore. Your notifications still show them.",
    });
  } catch (error) {
    console.error("Unsubscribe error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
