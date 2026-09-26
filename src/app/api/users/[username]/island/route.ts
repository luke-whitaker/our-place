import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireIslandAccess } from "@/lib/islands";

// GET: Whether the caller may visit a member's floating My Place island, and
// if so, the info /world needs to generate it (the layout itself is never
// stored — it's regenerated from the owner's id and biome on every visit).
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

    return NextResponse.json({
      owner: {
        id: gate.owner.id,
        username: gate.owner.username,
        display_name: gate.owner.displayName,
      },
      biome: gate.owner.biome,
      mailbox_color: gate.owner.mailboxColor,
    });
  } catch (error) {
    console.error("Island visit error:", error);
    return NextResponse.json({ error: "Failed to load that island." }, { status: 500 });
  }
}
