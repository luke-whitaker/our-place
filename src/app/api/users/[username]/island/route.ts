import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireIslandVisit } from "@/lib/islands";

// GET: Whether the caller may visit a member's floating My Place island, and
// if so, the info /world needs to generate it (the layout itself is never
// stored — it's regenerated from the owner's id and biome on every visit).
// `?gathering=<id>` is a gathering portal: while that gathering's mushroom
// stands on this island, its guests may come even if the island is closed to
// them, and `via_gathering` tells the page to keep the house shut.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { username } = await params;
    const gatheringId = new URL(request.url).searchParams.get("gathering");

    const gate = await requireIslandVisit(auth.user.userId, username, gatheringId);
    if (gate.error) return gate.error;

    return NextResponse.json({
      owner: {
        id: gate.owner.id,
        username: gate.owner.username,
        display_name: gate.owner.displayName,
      },
      biome: gate.owner.biome,
      mailbox_color: gate.owner.mailboxColor,
      via_gathering: gate.viaGathering,
    });
  } catch (error) {
    console.error("Island visit error:", error);
    return NextResponse.json({ error: "Failed to load that island." }, { status: 500 });
  }
}
