import type { Prisma } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { createGatheringLimiter } from "@/lib/rate-limit";
import { createGatheringSchema, getZodErrorMessage } from "@/lib/schemas";
import { inviteMembers, MAX_COMMUNITY_INVITEES, timesProblem } from "@/lib/gatherings";
import { firstFreeSlot, isUniqueConstraintError } from "@/lib/pockets";

type Invitees = { ok: true; ids: string[] } | { ok: false; response: NextResponse };

function refuse(error: string, status: number): Invitees {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/** Who a new gathering invites: the members the host picked, plus the whole
 * community when it's tied to one (the host must be a member). */
async function resolveInvitees(
  hostId: string,
  communityId: string | null,
  pickedIds: string[],
): Promise<Invitees> {
  const picked = [...new Set(pickedIds)].filter((id) => id !== hostId);
  const found = await prisma.user.count({ where: { id: { in: picked }, deletedAt: null } });
  if (found !== picked.length) return refuse("Some of those members couldn't be found.", 400);
  if (!communityId) return { ok: true, ids: picked };

  const membership = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId: hostId, communityId } },
    select: { id: true },
  });
  if (!membership) {
    return refuse("You can only host a gathering for a community you belong to.", 403);
  }
  const members = await prisma.communityMember.findMany({
    where: { communityId },
    select: { userId: true },
    take: MAX_COMMUNITY_INVITEES + 1,
  });
  if (members.length > MAX_COMMUNITY_INVITEES) {
    return refuse(
      `Community gatherings can invite up to ${MAX_COMMUNITY_INVITEES} members, and this community has more.`,
      400,
    );
  }
  // Additional invitees from outside the community ride along; inviteMembers
  // drops duplicates, so picking someone who is already a member is harmless.
  return { ok: true, ids: [...members.map((m) => m.userId), ...picked] };
}

/** Where a new Event Mushroom lands: the host's mailbox, else their pockets
 * (Luke, October 2), else nowhere, and the gathering isn't made. */
async function mushroomSlot(
  tx: Prisma.TransactionClient,
  hostId: string,
): Promise<{ location: "mailbox" | "pocket"; slot: number } | null> {
  const mailbox = await firstFreeSlot(tx, hostId, "mailbox");
  if (mailbox !== null) return { location: "mailbox", slot: mailbox };
  const pocket = await firstFreeSlot(tx, hostId, "pocket");
  return pocket === null ? null : { location: "pocket", slot: pocket };
}

// POST: host a gathering, in person or in the world. The gathering, the
// host's own "accepted" invite, every invitation (row, letter, notification),
// and a world gathering's Event Mushroom are written in one transaction.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const hostId = auth.user.userId;

    const limit = createGatheringLimiter.check(hostId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const parsed = createGatheringSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const input = parsed.data;
    const inWorld = input.kind === "world";
    if (!inWorld && !input.address) {
      return NextResponse.json(
        { error: "Add an address so people know where to go." },
        { status: 400 },
      );
    }
    const startsAt = new Date(input.starts_at);
    const endsAt = new Date(input.ends_at);
    const problem = timesProblem(startsAt, endsAt, new Date());
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const invitees = await resolveInvitees(hostId, input.community_id, input.invitee_ids);
    if (!invitees.ok) return invitees.response;

    const create = () =>
      prisma.$transaction(
        async (tx) => {
          // A world gathering's mushroom needs somewhere to land before
          // anything else is written; with no room, nothing is.
          const mushroomSpot = inWorld ? await mushroomSlot(tx, hostId) : null;
          if (inWorld && !mushroomSpot) return null;
          const gathering = await tx.gathering.create({
            data: {
              hostId,
              communityId: input.community_id,
              kind: input.kind,
              title: input.title,
              description: input.description,
              startsAt,
              endsAt,
              // A gathering in the world happens at its mushroom, not an address.
              address: inWorld ? "" : input.address,
            },
            select: { id: true, hostId: true, title: true, startsAt: true },
          });
          if (mushroomSpot) {
            await tx.item.create({
              data: {
                ownerId: hostId,
                kind: "event_mushroom",
                ...mushroomSpot,
                placedAt: mushroomSpot.location === "mailbox" ? new Date() : null,
                gatheringId: gathering.id,
              },
            });
          }
          await tx.gatheringInvite.create({
            data: {
              gatheringId: gathering.id,
              userId: hostId,
              status: "accepted",
              respondedAt: new Date(),
            },
          });
          await inviteMembers(tx, gathering, invitees.ids);
          return gathering;
        },
        // A community gathering writes up to three rows per member.
        { timeout: 20_000 },
      );

    // Letters pick free mailbox slots from one read; a letter someone drops in
    // the same instant can take a slot first. One retry with a fresh read
    // settles it; a second collision is reported rather than looped on.
    let gathering;
    try {
      gathering = await create();
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      gathering = await create();
    }
    if (!gathering) {
      return NextResponse.json(
        { error: "Your Event Mushroom needs room. Make room in your mailbox or pockets first." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        message: inWorld
          ? "Your gathering is set, and the invitations are out. Your Event Mushroom is waiting in your mailbox."
          : "Your gathering is set, and the invitations are out.",
        gathering: { id: gathering.id },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create gathering error:", error);
    return NextResponse.json({ error: "Failed to create that gathering." }, { status: 500 });
  }
}
