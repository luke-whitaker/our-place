import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { areFriends } from "@/lib/friends";
import { islandAccess } from "@/lib/islands";

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

    const owner = await prisma.user.findFirst({
      where: { username: { equals: username.toLowerCase(), mode: "insensitive" } },
      select: { id: true, username: true, displayName: true, biome: true, islandVisibility: true },
    });
    if (!owner) {
      return NextResponse.json({ error: "This person doesn't exist." }, { status: 404 });
    }

    const friends = await areFriends(auth.user.userId, owner.id);
    const access = islandAccess(auth.user.userId, owner, friends);

    if (access === "closed") {
      return NextResponse.json(
        { error: `${owner.displayName}'s island is closed to visitors.` },
        { status: 403 },
      );
    }
    if (access === "friends-only") {
      return NextResponse.json(
        { error: `${owner.displayName}'s island is open to friends only.` },
        { status: 403 },
      );
    }

    return NextResponse.json({
      owner: { id: owner.id, username: owner.username, display_name: owner.displayName },
      biome: owner.biome,
    });
  } catch (error) {
    console.error("Island visit error:", error);
    return NextResponse.json({ error: "Failed to load that island." }, { status: 500 });
  }
}
