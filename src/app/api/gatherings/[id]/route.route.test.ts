import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sendEmailBatch, type SendEmailParams } from "@/lib/email";
import { cancelUnplanted } from "@/lib/gathering-sweep";
import { emailGathering } from "@/lib/gathering-emails";
import { deleteAccount } from "@/lib/account-deletion";
import type { AuthPayload } from "@/lib/types";
import { createTestUser, jsonRequest } from "@/test/route-helpers";
import { POST as create } from "../route";
import { PATCH as changeTime } from "./route";
import { POST as respondRoute } from "./response/route";
import { POST as cancelRoute } from "./cancel/route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
// Never send real mail from a test: keep the real templates, record the sends.
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmailBatch: vi.fn(),
}));

const mockRequireAuth = vi.mocked(requireAuth);
const mockSend = vi.mocked(sendEmailBatch);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

/** Every email handed to the provider so far, in order. */
function sent(): SendEmailParams[] {
  return mockSend.mock.calls.flatMap(([batch]) => batch);
}

/** The addresses that got an email whose subject contains `subject`. */
function sentTo(subject: string): string[] {
  return sent()
    .filter((e) => e.subject.includes(subject))
    .map((e) => e.to)
    .sort();
}

/** Emails go out after the response, so wait for them to land. */
async function waitForEmail(subject: string) {
  await vi.waitFor(() => expect(sentTo(subject).length).toBeGreaterThan(0));
}

async function emailOf(user: AuthPayload): Promise<string> {
  const row = await prisma.user.findUniqueOrThrow({
    where: { id: user.userId },
    select: { email: true },
  });
  return row.email;
}

async function host(as: AuthPayload, inviteeIds: string[], overrides: object = {}) {
  authAs(as);
  const res = await create(
    jsonRequest("http://localhost/api/gatherings", {
      kind: "in_person",
      title: "Picnic in the park",
      description: "Bring a blanket. Gate code 4321.",
      starts_at: inHours(24),
      ends_at: inHours(27),
      address: "12 Linden Street",
      invitee_ids: inviteeIds,
      ...overrides,
    }),
  );
  const data = await res.json();
  return { status: res.status, id: data.gathering?.id as string };
}

async function patch(as: AuthPayload, id: string, body: unknown) {
  authAs(as);
  const res = await changeTime(
    jsonRequest(`http://localhost/api/gatherings/${id}`, body, "PATCH"),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, data: await res.json() };
}

async function respond(as: AuthPayload, id: string, response: "accepted" | "declined") {
  authAs(as);
  await respondRoute(jsonRequest(`http://localhost/api/gatherings/${id}/response`, { response }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockSend.mockReset();
});

describe("invitation emails", () => {
  it("emails each invitee once, with the title, host, and a link, but no description or address", async () => {
    const ada = await createTestUser({ displayName: "Ada" });
    const ben = await createTestUser();
    const cy = await createTestUser();
    const { status, id } = await host(ada, [ben.userId, cy.userId]);
    expect(status).toBe(201);

    await waitForEmail("invited you");
    expect(sentTo("invited you")).toEqual([await emailOf(ben), await emailOf(cy)].sort());
    const email = sent()[0];
    expect(email.subject).toBe("Ada invited you to Picnic in the park");
    expect(email.text).toContain(`/gatherings/${id}`);
    expect(email.text).not.toContain("Bring a blanket");
    expect(email.text).not.toContain("Linden");
    expect(email.html).not.toContain("Linden");
  });

  it("skips members who turned gathering emails off", async () => {
    const ada = await createTestUser();
    const ben = await createTestUser();
    const quiet = await createTestUser();
    await prisma.user.update({ where: { id: quiet.userId }, data: { emailGatherings: false } });
    await host(ada, [ben.userId, quiet.userId]);

    await waitForEmail("invited you");
    expect(sentTo("invited you")).toEqual([await emailOf(ben)]);
  });

  it("never emails across a block with the host", async () => {
    const ada = await createTestUser();
    const ben = await createTestUser();
    const blocked = await createTestUser();
    const { id } = await host(ada, [ben.userId]);
    await waitForEmail("invited you");
    mockSend.mockReset();
    await prisma.block.create({ data: { blockerId: blocked.userId, blockedId: ada.userId } });

    expect(await emailGathering("invited", id, [blocked.userId, ben.userId])).toBe(1);
    expect(sentTo("invited you")).toEqual([await emailOf(ben)]);
  });

  it("still creates the gathering and its notifications when the email provider fails", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSend.mockRejectedValue(new Error("provider down"));
    const ada = await createTestUser();
    const ben = await createTestUser();
    const { status, id } = await host(ada, [ben.userId]);

    expect(status).toBe(201);
    await vi.waitFor(() => expect(errors).toHaveBeenCalled());
    expect(
      await prisma.notification.count({ where: { gatheringId: id, recipientId: ben.userId } }),
    ).toBe(1);
    errors.mockRestore();
  });
});

describe("cancellation emails", () => {
  it("go to everyone still invited, never to the host or anyone who declined", async () => {
    const ada = await createTestUser();
    const going = await createTestUser();
    const pending = await createTestUser();
    const declined = await createTestUser();
    const { id } = await host(ada, [going.userId, pending.userId, declined.userId]);
    await respond(going, id, "accepted");
    await respond(declined, id, "declined");

    authAs(ada);
    const res = await cancelRoute(new Request(`http://localhost/api/gatherings/${id}/cancel`), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(200);

    await waitForEmail("is cancelled");
    expect(sentTo("is cancelled")).toEqual([await emailOf(going), await emailOf(pending)].sort());
  });

  it("go out when the sweep cancels a world gathering that wasn't planted", async () => {
    const ada = await createTestUser();
    const ben = await createTestUser();
    const { id } = await host(ada, [ben.userId], { kind: "world", address: "" });

    expect(await cancelUnplanted(new Date(Date.now() + 25 * HOUR))).toBe(1);
    await waitForEmail("is cancelled");
    expect(sentTo("is cancelled")).toEqual([await emailOf(ben)]);
    expect(sent().find((e) => e.subject.includes("is cancelled"))?.text).toContain(
      "wasn't planted by the start",
    );
    expect((await prisma.gathering.findUniqueOrThrow({ where: { id } })).status).toBe("cancelled");
  });

  it("are owed for the gatherings a deleted account cancels", async () => {
    const ada = await createTestUser();
    const ben = await createTestUser();
    const { id } = await host(ada, [ben.userId]);
    expect((await deleteAccount(ada.userId, "leave_posts")).cancelledGatheringIds).toEqual([id]);
  });
});

describe("PATCH /api/gatherings/[id] (change the time)", () => {
  it("lets only the host change it", async () => {
    const ada = await createTestUser();
    const ben = await createTestUser();
    const stranger = await createTestUser();
    const { id } = await host(ada, [ben.userId]);
    const times = { starts_at: inHours(48), ends_at: inHours(50) };

    expect((await patch(ben, id, times)).status).toBe(403);
    expect((await patch(stranger, id, times)).status).toBe(404);
  });

  it("refuses bad times, the same time, and a gathering that started or was cancelled", async () => {
    const ada = await createTestUser();
    const { id } = await host(ada, []);

    expect((await patch(ada, id, { starts_at: "soon" })).status).toBe(400);
    const backwards = await patch(ada, id, { starts_at: inHours(50), ends_at: inHours(48) });
    expect(backwards.data.error).toBe("The end has to come after the start.");
    const long = await patch(ada, id, { starts_at: inHours(48), ends_at: inHours(48 + 24 * 8) });
    expect(long.data.error).toBe("A gathering can last up to 7 days.");
    expect((await patch(ada, id, { starts_at: inHours(-5), ends_at: inHours(2) })).status).toBe(
      400,
    );
    const g = await prisma.gathering.findUniqueOrThrow({ where: { id } });
    const same = await patch(ada, id, {
      starts_at: g.startsAt.toISOString(),
      ends_at: g.endsAt.toISOString(),
    });
    expect(same.data.error).toBe("That's the time it already has.");

    await prisma.gathering.update({
      where: { id },
      data: { startsAt: new Date(Date.now() - HOUR), endsAt: new Date(Date.now() + HOUR) },
    });
    expect((await patch(ada, id, { starts_at: inHours(48), ends_at: inHours(50) })).status).toBe(
      409,
    );
    await prisma.gathering.update({
      where: { id },
      data: { startsAt: new Date(Date.now() + HOUR), status: "cancelled" },
    });
    expect((await patch(ada, id, { starts_at: inHours(48), ends_at: inHours(50) })).status).toBe(
      409,
    );
  });

  it("moves it, keeps every answer, rewrites the letters, and tells everyone still invited", async () => {
    const ada = await createTestUser({ displayName: "Ada" });
    const going = await createTestUser();
    const pending = await createTestUser();
    const declined = await createTestUser();
    const { id } = await host(ada, [going.userId, pending.userId, declined.userId]);
    await respond(going, id, "accepted");
    await respond(declined, id, "declined");
    await waitForEmail("invited you");
    mockSend.mockReset();

    const startsAt = inHours(72);
    const { status } = await patch(ada, id, { starts_at: startsAt, ends_at: inHours(74) });
    expect(status).toBe(200);

    const g = await prisma.gathering.findUniqueOrThrow({ where: { id } });
    expect(g.startsAt.toISOString()).toBe(startsAt);
    const answers = await prisma.gatheringInvite.findMany({
      where: { gatheringId: id },
      select: { userId: true, status: true },
    });
    expect(Object.fromEntries(answers.map((a) => [a.userId, a.status]))).toEqual({
      [ada.userId]: "accepted",
      [going.userId]: "accepted",
      [pending.userId]: "pending",
      [declined.userId]: "declined",
    });

    const letter = await prisma.item.findFirstOrThrow({
      where: { gatheringId: id, ownerId: pending.userId, kind: "note" },
      select: { body: true },
    });
    const newDay = new Date(startsAt).toLocaleDateString("en-US", {
      timeZone: "America/Chicago",
      month: "long",
      day: "numeric",
    });
    expect(letter.body).toContain(newDay);

    const told = await prisma.notification.findMany({
      where: { gatheringId: id, kind: "gathering_time_changed" },
      select: { recipientId: true },
    });
    expect(told.map((n) => n.recipientId).sort()).toEqual([going.userId, pending.userId].sort());

    await waitForEmail("New time for");
    expect(sentTo("New time for")).toEqual([await emailOf(going), await emailOf(pending)].sort());
    expect(sent()[0].text).toContain("If you can't make the new time, update your answer");
  });

  it("moves when an unplanted world gathering is cancelled", async () => {
    const ada = await createTestUser();
    const { id } = await host(ada, [], { kind: "world", address: "" });
    expect((await patch(ada, id, { starts_at: inHours(48), ends_at: inHours(50) })).status).toBe(
      200,
    );

    // Past the old start, before the new one: still scheduled.
    expect(await cancelUnplanted(new Date(Date.now() + 30 * HOUR))).toBe(0);
    // Past the new start: cancelled.
    expect(await cancelUnplanted(new Date(Date.now() + 49 * HOUR))).toBe(1);
    expect((await prisma.gathering.findUniqueOrThrow({ where: { id } })).status).toBe("cancelled");
  });

  it("keeps a planted Event Mushroom where it is", async () => {
    const ada = await createTestUser();
    const { id } = await host(ada, [], { kind: "world", address: "" });
    await prisma.gathering.update({
      where: { id },
      data: { mushroomWorld: "capital", mushroomCol: 10, mushroomRow: 12, plantedAt: new Date() },
    });

    expect((await patch(ada, id, { starts_at: inHours(48), ends_at: inHours(50) })).status).toBe(
      200,
    );
    const g = await prisma.gathering.findUniqueOrThrow({ where: { id } });
    expect([g.mushroomWorld, g.mushroomCol, g.mushroomRow]).toEqual(["capital", 10, 12]);
    expect(g.plantedAt).not.toBeNull();
    expect(await cancelUnplanted(new Date(Date.now() + 49 * HOUR))).toBe(0);
  });
});
