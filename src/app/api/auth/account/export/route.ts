import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { exportAccountLimiter } from "@/lib/rate-limit";
import { exportAccount } from "@/lib/account-export";

// GET: "Download my data": everything Our Place keeps about the caller, as a
// JSON file. Only ever their own; other members appear by name only.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const limit = exportAccountLimiter.check(me);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "You've downloaded your data a few times already. Try again in an hour." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const data = await exportAccount(me);
    const day = data.exported_at.slice(0, 10);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="our-place-${data.profile.username}-${day}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Export account error:", error);
    return NextResponse.json({ error: "Failed to gather your data." }, { status: 500 });
  }
}
