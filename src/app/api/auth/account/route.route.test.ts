import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sendEmailChangedNotice } from "@/lib/email";
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

// Never send real mail from a test; record who would have been told instead.
vi.mock("@/lib/email", () => ({ sendEmailChangedNotice: vi.fn() }));

const mockRequireAuth = vi.mocked(requireAuth);
const mockNotice = vi.mocked(sendEmailChangedNotice);

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

describe("PATCH /api/auth/account sign-in details", () => {
  const PASSWORD = "the-right-password";

  beforeEach(() => {
    mockRequireAuth.mockReset();
    mockNotice.mockReset();
  });

  /** A member with a real password hash, signed in. Cost 4 keeps the test fast. */
  async function signedInMember() {
    const user = await createTestUser();
    await prisma.user.update({
      where: { id: user.userId },
      data: { passwordHash: await bcrypt.hash(PASSWORD, 4) },
    });
    authAs(user);
    return user;
  }

  async function row(userId: string) {
    return prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, phone: true },
    });
  }

  it.each([{ email: "taken-over@example.test" }, { phone: "5551234567" }])(
    "refuses %o without the current password",
    async (change) => {
      const user = await signedInMember();
      const before = await row(user.userId);

      const { status } = await patchAccount(change);
      expect(status).toBe(400);
      expect(await row(user.userId)).toEqual(before);
      expect(mockNotice).not.toHaveBeenCalled();
    },
  );

  it.each([{ email: "taken-over@example.test" }, { phone: "5551234567" }])(
    "refuses %o with the wrong password",
    async (change) => {
      const user = await signedInMember();
      const before = await row(user.userId);

      const { status, body } = await patchAccount({ ...change, current_password: "guess" });
      expect(status).toBe(403);
      expect(body.error).toBe("Current password is incorrect.");
      expect(await row(user.userId)).toEqual(before);
    },
  );

  it("doesn't reveal a taken email to a caller without the password", async () => {
    const other = await createTestUser();
    const otherEmail = (await row(other.userId)).email;
    await signedInMember();

    const { status } = await patchAccount({ email: otherEmail, current_password: "guess" });
    expect(status).toBe(403);
  });

  it("changes the email with the right password and tells the old address", async () => {
    const user = await signedInMember();
    const oldEmail = (await row(user.userId)).email;

    const { status } = await patchAccount({
      email: "New.Address@Example.test",
      current_password: PASSWORD,
    });
    expect(status).toBe(200);
    expect((await row(user.userId)).email).toBe("new.address@example.test");
    expect(mockNotice).toHaveBeenCalledWith(oldEmail, "new.address@example.test");
  });

  it("keeps the change when the notice fails to send", async () => {
    const user = await signedInMember();
    mockNotice.mockRejectedValue(new Error("provider down"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

    const { status } = await patchAccount({
      email: "kept@example.test",
      current_password: PASSWORD,
    });
    expect(status).toBe(200);
    expect((await row(user.userId)).email).toBe("kept@example.test");
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it("changes the phone with the right password", async () => {
    const user = await signedInMember();

    const { status } = await patchAccount({ phone: "(555) 123-4567", current_password: PASSWORD });
    expect(status).toBe(200);
    expect((await row(user.userId)).phone).toBe("5551234567");
    expect(mockNotice).not.toHaveBeenCalled();
  });

  it("still lets a member change their theme without a password", async () => {
    await signedInMember();
    const { status } = await patchAccount({ theme: "dusk" });
    expect(status).toBe(200);
  });
});
