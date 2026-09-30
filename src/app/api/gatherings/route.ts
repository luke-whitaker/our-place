import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { createGatheringLimiter } from "@/lib/rate-limit";
import { createGatheringSchema, getZodErrorMessage } from "@/lib/schemas";
import { inviteMembers, MAX_COMMUNITY_INVITEES, timesProblem } from "@/lib/gatherings";
import { isUniqueConstraintError } from "@/lib/pockets";

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
  const found = await prisma.user.count({ where: { id: { in: picked } } });
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

// POST: host a gathering. In person only until v0.20.0 brings gatherings in
// the world. The gathering, the host's own "accepted" invite, and every
// invitation (row, letter, notification) are written in one transaction.
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
    if (input.kind === "world") {
      return NextResponse.json(
        { error: "Gatherings in the world are coming soon. For now, host one in person." },
        { status: 400 },
      );
    }
    if (!input.address) {
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
          const gathering = await tx.gathering.create({
            data: {
              hostId,
              communityId: input.community_id,
              kind: input.kind,
              title: input.title,
              description: input.description,
              startsAt,
              endsAt,
              address: input.address,
            },
            select: { id: true, hostId: true, title: true, startsAt: true },
          });
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

    return NextResponse.json(
      {
        message: "Your gathering is set, and the invitations are out.",
        gathering: { id: gathering.id },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create gathering error:", error);
    return NextResponse.json({ error: "Failed to create that gathering." }, { status: 500 });
  }
}
