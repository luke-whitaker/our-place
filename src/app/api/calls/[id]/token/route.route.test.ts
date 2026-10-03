import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { mintCallToken, voiceConfigured } from "@/lib/livekit";
import type { AuthPayload, CallTokenResponse } from "@/lib/types";
import { createTestUser, jsonRequest } from "@/test/route-helpers";
import { befriend, block, minutesAgo, seatStatus, seedCall } from "@/test/call-helpers";
import { POST } from "./route";
import { POST as startCall } from "../../route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/livekit", () => ({
  CALL_TOKEN_TTL_SECONDS: 600,
  voiceConfigured: vi.fn(() => true),
  voiceUrl: vi.fn(() => "wss://voice.test"),
  mintCallToken: vi.fn(async () => "test-token"),
  removeFromRoom: vi.fn(async () => {}),
  closeRoom: vi.fn(async () => {}),
}));
const mockRequireAuth = vi.mocked(requireAuth);

function tokenAs(user: AuthPayload, callId: string) {
  mockRequireAuth.mockResolvedValue({ user });
  return POST(new Request(`http://localhost/api/calls/${callId}/token`, { method: "POST" }), {
    params: Promise.resolve({ id: callId }),
  });
}

async function refusal(res: Response, status: number): Promise<string> {
  expect(res.status).toBe(status);
  return (await res.json()).error as string;
}

describe("POST /api/calls/[id]/token", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
    vi.mocked(mintCallToken).mockClear();
    vi.mocked(voiceConfigured).mockReturnValue(true);
  });

  it("joins an invited member and hands back an audio-only token for this call", async () => {
    const caller = await createTestUser();
    const me = await createTestUser({ displayName: "Sam" });
    const callId = await seedCall([
      { user: caller, status: "joined" },
      { user: me, status: "pending" },
    ]);

    const res = await tokenAs(me, callId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as CallTokenResponse;
    expect(body).toMatchObject({ call_id: callId, url: "wss://voice.test", token: "test-token" });
    expect(new Date(body.expires_at).getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
    expect(mintCallToken).toHaveBeenCalledWith({
      callId,
      userId: me.userId,
      displayName: "Sam",
    });
    expect(await seatStatus(callId, me)).toBe("joined");
  });

  it("refreshes the token for someone already in, and lets someone who left rejoin", async () => {
    const caller = await createTestUser();
    const me = await createTestUser();
    const callId = await seedCall([
      { user: caller, status: "joined" },
      { user: me, status: "left" },
    ]);

    expect((await tokenAs(me, callId)).status).toBe(200);
    expect((await tokenAs(caller, callId)).status).toBe(200);
    expect(await seatStatus(callId, me)).toBe("joined");
  });

  it("gives the starter a token right after starting, with only invitations out", async () => {
    const me = await createTestUser();
    const friend = await createTestUser();
    await befriend(me, friend);
    mockRequireAuth.mockResolvedValue({ user: me });
    const started = await startCall(
      jsonRequest("http://localhost/api/calls", { usernames: [friend.username] }),
    );
    const { call_id } = await started.json();

    expect((await tokenAs(me, call_id)).status).toBe(200);
    expect(await seatStatus(call_id, me)).toBe("joined");
  });

  it("lets a member alone in a call refresh their token while others are invited", async () => {
    const me = await createTestUser();
    const invited = await createTestUser();
    const left = await createTestUser();
    const callId = await seedCall([
      { user: me, status: "joined", at: new Date(Date.now() - 20_000) },
      { user: invited, status: "pending" },
      { user: left, status: "left" },
    ]);

    expect((await tokenAs(me, callId)).status).toBe(200);
    const call = await prisma.call.findUniqueOrThrow({ where: { id: callId } });
    expect(call.endedAt).toBeNull();
  });

  it("won't let someone who isn't present revive a call nobody is in", async () => {
    const caller = await createTestUser();
    const me = await createTestUser();
    const callId = await seedCall([
      { user: caller, status: "left" },
      { user: me, status: "left" },
    ]);

    expect(await refusal(await tokenAs(me, callId), 409)).toBe("This call has ended.");
    expect(await seatStatus(callId, me)).toBe("left");
  });

  it("refuses someone never invited", async () => {
    const caller = await createTestUser();
    const stranger = await createTestUser();
    const callId = await seedCall([{ user: caller, status: "joined" }]);

    await refusal(await tokenAs(stranger, callId), 404);
    expect(mintCallToken).not.toHaveBeenCalled();
  });

  it("refuses an expired invitation and one already declined", async () => {
    const caller = await createTestUser();
    const late = await createTestUser();
    const declined = await createTestUser();
    const callId = await seedCall([
      { user: caller, status: "joined" },
      { user: late, status: "pending", at: minutesAgo(11) },
      { user: declined, status: "declined" },
    ]);

    expect(await refusal(await tokenAs(late, callId), 409)).toBe("This invitation has expired.");
    await refusal(await tokenAs(declined, callId), 409);
  });

  it("refuses a call that has ended, or that nobody is in any more", async () => {
    const caller = await createTestUser();
    const me = await createTestUser();
    const ended = await seedCall(
      [
        { user: caller, status: "left" },
        { user: me, status: "pending" },
      ],
      new Date(),
    );
    const abandoned = await seedCall([
      { user: caller, status: "joined", at: minutesAgo(2) },
      { user: me, status: "pending" },
    ]);

    expect(await refusal(await tokenAs(me, ended), 409)).toBe("This call has ended.");
    expect(await refusal(await tokenAs(me, abandoned), 409)).toBe("This call has ended.");
    const call = await prisma.call.findUniqueOrThrow({ where: { id: abandoned } });
    expect(call.endedAt).not.toBeNull();
  });

  it("refuses a ghost", async () => {
    const caller = await createTestUser();
    const me = await createTestUser();
    const callId = await seedCall([
      { user: caller, status: "joined" },
      { user: me, status: "pending" },
    ]);
    await prisma.user.update({ where: { id: me.userId }, data: { ghost: true } });

    await refusal(await tokenAs(me, callId), 403);
  });

  it("refuses someone already present in another call", async () => {
    const caller = await createTestUser();
    const other = await createTestUser();
    const me = await createTestUser();
    const callId = await seedCall([
      { user: caller, status: "joined" },
      { user: me, status: "pending" },
    ]);
    await seedCall([
      { user: other, status: "joined" },
      { user: me, status: "joined" },
    ]);

    const error = await refusal(await tokenAs(me, callId), 409);
    expect(error).toBe("You're already in a call. Leave it first.");
  });

  it("refuses a ninth person", async () => {
    const present = await Promise.all(Array.from({ length: 8 }, () => createTestUser()));
    const me = await createTestUser();
    const callId = await seedCall([
      ...present.map((user) => ({ user, status: "joined" as const })),
      { user: me, status: "pending" },
    ]);

    expect(await refusal(await tokenAs(me, callId), 409)).toBe("This call is full.");
  });

  it("refuses anyone in a block, either way, with someone present", async () => {
    const caller = await createTestUser();
    const guest = await createTestUser();
    const me = await createTestUser();
    const callId = await seedCall([
      { user: caller, status: "joined" },
      { user: guest, status: "joined" },
      { user: me, status: "pending" },
    ]);
    await block(guest, me);

    await refusal(await tokenAs(me, callId), 403);
    expect(await seatStatus(callId, me)).toBe("pending");
  });

  it("answers 503 when this server has no LiveKit keys", async () => {
    const me = await createTestUser();
    const callId = await seedCall([{ user: me, status: "joined" }]);
    vi.mocked(voiceConfigured).mockReturnValue(false);

    expect(await refusal(await tokenAs(me, callId), 503)).toBe(
      "Voice isn't set up on this server.",
    );
  });
});
