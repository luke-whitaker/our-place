import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { MAILBOX_SLOTS } from "@/lib/items";
import { MAX_PICKED_INVITEES } from "@/lib/types";
import { MAX_COMMUNITY_INVITEES } from "@/lib/gatherings";
import type { AuthPayload, GatheringCalendar, GatheringDetail } from "@/lib/types";
import {
  createTestCommunity,
  createTestLetter,
  createTestUser,
  joinCommunity,
  jsonRequest,
} from "@/test/route-helpers";
import { POST as create } from "./route";
import { GET as detail } from "./[id]/route";
import { POST as respondRoute } from "./[id]/response/route";
import { POST as cancelRoute } from "./[id]/cancel/route";
import { GET as calendarRoute } from "./calendar/route";
import { GET as notificationsRoute } from "@/app/api/notifications/route";
import { GET as mailboxRoute } from "@/app/api/mailbox/route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

const HOUR = 60 * 60 * 1000;
const ADDRESS = "12 Linden Street, Iowa City";

function inHours(hours: number): string {
  return new Date(Date.now() + hours * HOUR).toISOString();
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    kind: "in_person",
    title: "Picnic in the park",
    description: "Bring a blanket.",
    starts_at: inHours(24),
    ends_at: inHours(27),
    address: ADDRESS,
    ...overrides,
  };
}

async function host(as: AuthPayload, overrides: Record<string, unknown> = {}) {
  authAs(as);
  const res = await create(jsonRequest("http://localhost/api/gatherings", body(overrides)));
  const data = await res.json();
  return { status: res.status, data, id: data.gathering?.id as string | undefined };
}

async function view(as: AuthPayload, id: string) {
  authAs(as);
  const res = await detail(new Request(`http://localhost/api/gatherings/${id}`), {
    params: Promise.resolve({ id }),
  });
  return { status: res.status, data: await res.json() };
}

async function respond(as: AuthPayload, id: string, response: "accepted" | "declined") {
  authAs(as);
  const res = await respondRoute(
    jsonRequest(`http://localhost/api/gatherings/${id}/response`, { response }),
    {
      params: Promise.resolve({ id }),
    },
  );
  return { status: res.status, data: await res.json() };
}

async function cancel(as: AuthPayload, id: string) {
  authAs(as);
  const res = await cancelRoute(new Request(`http://localhost/api/gatherings/${id}/cancel`), {
    params: Promise.resolve({ id }),
  });
  return res.status;
}

async function calendar(as: AuthPayload, community?: string) {
  authAs(as);
  const params = new URLSearchParams({ from: inHours(-24 * 7), to: inHours(24 * 30) });
  if (community) params.set("community", community);
  const res = await calendarRoute(
    new NextRequest(`http://localhost/api/gatherings/calendar?${params}`),
  );
  return { status: res.status, data: (await res.json()) as GatheringCalendar };
}

async function notifications(as: AuthPayload) {
  authAs(as);
  return (await (await notificationsRoute()).json()).notifications;
}

function makeStarted(id: string) {
  return prisma.gathering.update({
    where: { id },
    data: { startsAt: new Date(Date.now() - HOUR), endsAt: new Date(Date.now() + HOUR) },
  });
}

beforeEach(() => mockRequireAuth.mockReset());

describe("POST /api/gatherings", () => {
  it("hosts a gathering, accepts for the host, and invites the picked members", async () => {
    const [me, ada, ben] = [await createTestUser(), await createTestUser(), await createTestUser()];
    const { status, id } = await host(me, { invitee_ids: [ada.userId, me.userId] });

    expect(status).toBe(201);
    const invites = await prisma.gatheringInvite.findMany({
      where: { gatheringId: id },
      select: { userId: true, status: true },
    });
    expect(invites).toHaveLength(2);
    expect(invites).toContainEqual({ userId: me.userId, status: "accepted" });
    expect(invites).toContainEqual({ userId: ada.userId, status: "pending" });
    expect(await prisma.gatheringInvite.count({ where: { userId: ben.userId } })).toBe(0);
  });

  it("refuses gatherings in the world until the next release", async () => {
    const me = await createTestUser();
    expect((await host(me, { kind: "world" })).status).toBe(400);
  });

  it("needs an address for an in-person gathering", async () => {
    const me = await createTestUser();
    expect((await host(me, { address: "  " })).status).toBe(400);
  });

  it("refuses bad times", async () => {
    const me = await createTestUser();
    expect((await host(me, { starts_at: inHours(-2), ends_at: inHours(1) })).status).toBe(400);
    expect((await host(me, { ends_at: inHours(23) })).status).toBe(400);
    expect((await host(me, { ends_at: inHours(24 + 24 * 8) })).status).toBe(400);
  });

  it("caps hand-picked invitees", async () => {
    const me = await createTestUser();
    const ids = Array.from({ length: MAX_PICKED_INVITEES + 1 }, () => crypto.randomUUID());
    expect((await host(me, { invitee_ids: ids })).status).toBe(400);
  });

  it("refuses invitees who don't exist", async () => {
    const me = await createTestUser();
    expect((await host(me, { invitee_ids: [crypto.randomUUID()] })).status).toBe(400);
  });

  it("lets only members host for a community", async () => {
    const [owner, outsider] = [await createTestUser(), await createTestUser()];
    const communityId = await createTestCommunity(owner.userId);
    await joinCommunity(owner.userId, communityId);

    expect((await host(outsider, { community_id: communityId })).status).toBe(403);
    expect((await host(owner, { community_id: communityId })).status).toBe(201);
  });

  it("invites the whole community: rows, letters, and notifications, skipping only full mailboxes' letters", async () => {
    const [me, ada, ben, outsider] = [
      await createTestUser(),
      await createTestUser(),
      await createTestUser(),
      await createTestUser(),
    ];
    const communityId = await createTestCommunity(me.userId);
    for (const u of [me, ada, ben]) await joinCommunity(u.userId, communityId);
    for (let slot = 0; slot < MAILBOX_SLOTS; slot++) {
      await createTestLetter({ ownerId: ben.userId, slot, body: "Full" });
    }
    await createTestLetter({ ownerId: ada.userId, slot: 0, body: "Earlier letter" });

    const { id } = await host(me, { community_id: communityId, invitee_ids: [outsider.userId] });

    const invited = await prisma.gatheringInvite.findMany({
      where: { gatheringId: id, status: "pending" },
      select: { userId: true },
    });
    expect(invited.map((i) => i.userId).sort()).toEqual([ada.userId, ben.userId].sort());

    const letters = await prisma.item.findMany({
      where: { gatheringId: id },
      select: { ownerId: true, slot: true, fromId: true, body: true },
    });
    expect(letters).toEqual([
      { ownerId: ada.userId, slot: 1, fromId: me.userId, body: expect.any(String) },
    ]);
    expect(letters[0].body).toContain("Picnic in the park");
    expect(letters[0].body).not.toContain("Linden");

    const notified = await prisma.notification.findMany({
      where: { gatheringId: id, kind: "gathering_invite" },
      select: { recipientId: true },
    });
    expect(notified.map((n) => n.recipientId).sort()).toEqual([ada.userId, ben.userId].sort());
  });

  it("refuses a community larger than the invitation cap", async () => {
    const me = await createTestUser();
    const communityId = await createTestCommunity(me.userId);
    await joinCommunity(me.userId, communityId);
    const users = await prisma.user.createManyAndReturn({
      data: Array.from({ length: MAX_COMMUNITY_INVITEES }, (_, i) => ({
        username: `bulk_${i}_${me.userId.slice(0, 6)}`,
        displayName: `Bulk ${i}`,
        email: `bulk_${i}_${me.userId.slice(0, 6)}@example.test`,
        passwordHash: "x",
      })),
      select: { id: true },
    });
    await prisma.communityMember.createMany({
      data: users.map((u) => ({ userId: u.id, communityId })),
    });

    const { status } = await host(me, { community_id: communityId });

    expect(status).toBe(400);
    expect(await prisma.gathering.count()).toBe(0);
  });
});

describe("who can see a gathering", () => {
  it("shows the host, invitees, and current community members, and 404s everyone else", async () => {
    const [me, ada, lateJoiner, outsider] = [
      await createTestUser(),
      await createTestUser(),
      await createTestUser(),
      await createTestUser(),
    ];
    const communityId = await createTestCommunity(me.userId);
    for (const u of [me, ada]) await joinCommunity(u.userId, communityId);
    const { id } = await host(me, { community_id: communityId });
    await joinCommunity(lateJoiner.userId, communityId);

    const asHost = await view(me, id!);
    expect(asHost.status).toBe(200);
    const hostView = asHost.data.gathering as GatheringDetail;
    expect(hostView.address).toBe(ADDRESS);
    expect(hostView.attendees?.pending.map((p) => p.username)).toEqual([ada.username]);

    const asAda = (await view(ada, id!)).data.gathering as GatheringDetail;
    expect(asAda.address).toBe(ADDRESS);
    expect(asAda.attendees).toBeNull();
    expect(asAda.my_response).toBe("pending");

    const asLate = await view(lateJoiner, id!);
    expect(asLate.status).toBe(200);
    expect(asLate.data.gathering.my_response).toBeNull();

    const asOutsider = await view(outsider, id!);
    expect(asOutsider.status).toBe(404);
    expect(JSON.stringify(asOutsider.data)).not.toContain("Linden");
    expect((await respond(outsider, id!, "accepted")).status).toBe(404);
  });

  it("lets a member who joined later answer, which gives them an invite row", async () => {
    const [me, late] = [await createTestUser(), await createTestUser()];
    const communityId = await createTestCommunity(me.userId);
    await joinCommunity(me.userId, communityId);
    const { id } = await host(me, { community_id: communityId });
    await joinCommunity(late.userId, communityId);

    expect((await respond(late, id!, "accepted")).status).toBe(200);
    expect(
      await prisma.gatheringInvite.findUnique({
        where: { gatheringId_userId: { gatheringId: id!, userId: late.userId } },
        select: { status: true },
      }),
    ).toEqual({ status: "accepted" });
  });
});

describe("POST /api/gatherings/[id]/response", () => {
  it("accepts, declines, and changes, and the letter and the notification both show it", async () => {
    const [me, ada] = [await createTestUser(), await createTestUser()];
    const { id } = await host(me, { invitee_ids: [ada.userId] });

    expect((await respond(ada, id!, "accepted")).data.my_response).toBe("accepted");
    let [note] = await notifications(ada);
    expect(note.gathering.my_response).toBe("accepted");

    expect((await respond(ada, id!, "declined")).status).toBe(200);
    [note] = await notifications(ada);
    expect(note.gathering.my_response).toBe("declined");

    authAs(ada);
    const mailbox = await (await mailboxRoute()).json();
    expect(mailbox.letters[0].gathering_id).toBe(id);
    expect((await view(ada, mailbox.letters[0].gathering_id)).data.gathering.my_response).toBe(
      "declined",
    );
  });

  it("won't let the host decline their own gathering", async () => {
    const me = await createTestUser();
    const { id } = await host(me);
    expect((await respond(me, id!, "declined")).status).toBe(400);
  });

  it("stops answers once the gathering starts or is cancelled", async () => {
    const [me, ada, ben] = [await createTestUser(), await createTestUser(), await createTestUser()];
    const started = await host(me, { invitee_ids: [ada.userId] });
    await makeStarted(started.id!);
    expect((await respond(ada, started.id!, "accepted")).status).toBe(409);

    const cancelled = await host(me, { invitee_ids: [ben.userId] });
    expect(await cancel(me, cancelled.id!)).toBe(200);
    expect((await respond(ben, cancelled.id!, "accepted")).status).toBe(409);
  });
});

describe("POST /api/gatherings/[id]/cancel", () => {
  it("lets only the host cancel, and tells only the people going", async () => {
    const [me, going, maybe, declined] = [
      await createTestUser(),
      await createTestUser(),
      await createTestUser(),
      await createTestUser(),
    ];
    const { id } = await host(me, { invitee_ids: [going.userId, maybe.userId, declined.userId] });
    await respond(going, id!, "accepted");
    await respond(declined, id!, "declined");

    expect(await cancel(going, id!)).toBe(403);
    expect(await cancel(me, id!)).toBe(200);
    expect(await cancel(me, id!)).toBe(409);

    const told = await prisma.notification.findMany({
      where: { gatheringId: id, kind: "gathering_cancelled" },
      select: { recipientId: true },
    });
    expect(told).toEqual([{ recipientId: going.userId }]);
    expect((await calendar(going)).data.gatherings).toEqual([]);
    expect((await view(going, id!)).data.gathering.status).toBe("cancelled");
  });

  it("can't cancel a gathering that has ended", async () => {
    const me = await createTestUser();
    const { id } = await host(me);
    await prisma.gathering.update({
      where: { id },
      data: { startsAt: new Date(Date.now() - 3 * HOUR), endsAt: new Date(Date.now() - HOUR) },
    });
    expect(await cancel(me, id!)).toBe(409);
  });
});

describe("GET /api/gatherings/calendar", () => {
  it("shows a community's calendar to its members only", async () => {
    const [me, outsider] = [await createTestUser(), await createTestUser()];
    const communityId = await createTestCommunity(me.userId);
    await joinCommunity(me.userId, communityId);
    const { id } = await host(me, { community_id: communityId });
    const { slug } = await prisma.community.findUniqueOrThrow({
      where: { id: communityId },
      select: { slug: true },
    });

    const mine = await calendar(me, slug);
    expect(mine.status).toBe(200);
    expect(mine.data.gatherings.map((g) => g.id)).toEqual([id]);
    expect(mine.data.upcoming.map((g) => g.id)).toEqual([id]);
    expect(JSON.stringify(mine.data)).not.toContain("Linden");

    expect((await calendar(outsider, slug)).status).toBe(403);
  });

  it("keeps a member's own calendar to what they host, are invited to, or accepted", async () => {
    const [me, ada] = [await createTestUser(), await createTestUser()];
    const pending = await host(me, { invitee_ids: [ada.userId], title: "Pending one" });
    const accepted = await host(me, { invitee_ids: [ada.userId], title: "Accepted one" });
    const declined = await host(me, { invitee_ids: [ada.userId], title: "Declined one" });
    await respond(ada, accepted.id!, "accepted");
    await respond(ada, declined.id!, "declined");
    await host(me, { title: "Not invited" });

    const ids = (await calendar(ada)).data.gatherings.map((g) => g.id).sort();
    expect(ids).toEqual([pending.id, accepted.id].sort());
    expect((await calendar(me)).data.gatherings).toHaveLength(4);
  });

  it("refuses a range wider than a six-week grid", async () => {
    const me = await createTestUser();
    authAs(me);
    const params = new URLSearchParams({ from: inHours(0), to: inHours(24 * 60) });
    const res = await calendarRoute(
      new NextRequest(`http://localhost/api/gatherings/calendar?${params}`),
    );
    expect(res.status).toBe(400);
  });
});
