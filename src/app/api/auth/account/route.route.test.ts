import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser, jsonRequest } from "@/test/route-helpers";
import { PATCH } from "./route";

// requireAuth reads cookies via next/headers, which doesn't work outside a
// real Next request, so the caller is chosen per test.
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
  signToken: vi.fn(() => "token"),
  AUTH_COOKIE_OPTIONS: { httpOnly: true, sameSite: "strict" as const, path: "/" },
}));

const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

async function patchAccount(body: unknown) {
  const request = jsonRequest("http://localhost/api/auth/account", body, "PATCH");
  const res = await PATCH(request);
  return { status: res.status, body: await res.json() };
}

describe("PATCH /api/auth/account mailbox_color", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("saves a valid mailbox color", async () => {
    const user = await createTestUser();
    authAs(user);

    const { status, body } = await patchAccount({ mailbox_color: "green" });
    expect(status).toBe(200);
    expect(body.message).toBe("Account updated.");

    const row = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { mailboxColor: true },
    });
    expect(row?.mailboxColor).toBe("green");
  });

  it("refuses a mailbox color outside the known list", async () => {
    const user = await createTestUser();
    authAs(user);

    const { status, body } = await patchAccount({ mailbox_color: "gold" });
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();

    const row = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { mailboxColor: true },
    });
    expect(row?.mailboxColor).toBe("slate");
  });
});
