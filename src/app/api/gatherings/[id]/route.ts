import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { gatheringAccess, toGatheringEntry } from "@/lib/gatherings";
import type { GatheringDetail, GatheringPerson, GatheringStatus } from "@/lib/types";

function toPerson(user: { username: string; displayName: string }): GatheringPerson {
  return { username: user.username, display_name: user.displayName };
}

// GET: one gathering, address included, for anyone who can see it (the host,
// an invitee, or a current member of its community). Everyone else gets 404.
// The host also gets everyone's answers; invitees see only who's going.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { id } = await params;

    const access = await gatheringAccess(id, auth.user.userId);
    if (!access) return NextResponse.json({ error: "Gathering not found." }, { status: 404 });

    const [details, invites] = await Promise.all([
      prisma.gathering.findUniqueOrThrow({
        where: { id },
        select: { description: true, address: true },
      }),
      prisma.gatheringInvite.findMany({
        where: { gatheringId: id },
        select: { status: true, user: { select: { username: true, displayName: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const byStatus = (status: string) =>
      invites.filter((i) => i.status === status).map((i) => toPerson(i.user));

    const gathering: GatheringDetail = {
      ...toGatheringEntry(access.gathering, access.invite?.status ?? null),
      description: details.description,
      address: details.address,
      status: access.gathering.status as GatheringStatus,
      is_host: access.isHost,
      started: access.gathering.startsAt.getTime() <= Date.now(),
      ended: access.gathering.endsAt.getTime() <= Date.now(),
      going: byStatus("accepted"),
      attendees: access.isHost
        ? {
            accepted: byStatus("accepted"),
            pending: byStatus("pending"),
            declined: byStatus("declined"),
          }
        : null,
    };
    return NextResponse.json({ gathering });
  } catch (error) {
    console.error("Gathering error:", error);
    return NextResponse.json({ error: "Failed to load that gathering." }, { status: 500 });
  }
}
