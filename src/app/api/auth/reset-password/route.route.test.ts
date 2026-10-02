import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { hashResetCode } from "@/lib/auth";
import { sendPasswordResetCode } from "@/lib/email";
import { createTestUser } from "@/test/route-helpers";
import { POST as forgotPassword } from "../forgot-password/route";
import { POST as resetPassword } from "./route";

// Never send real mail from a test; read the code from what would have been sent.
vi.mock("@/lib/email", () => ({ sendPasswordResetCode: vi.fn() }));
const mockSend = vi.mocked(sendPasswordResetCode);

// Each route has a small per-IP limit, so every request gets its own address.
let nextIp = 0;
function post(url: string, body: unknown) {
  nextIp += 1;
  return new NextRequest(new URL(url, "http://localhost"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.2.0.${nextIp}` },
    body: JSON.stringify(body),
  });
}

async function requestCode(email: string): Promise<string> {
  mockSend.mockClear();
  const res = await forgotPassword(post("/api/auth/forgot-password", { email }));
  expect(res.status).toBe(200);
  return mockSend.mock.calls[0][1];
}

async function reset(email: string, code: string, newPassword = "a-brand-new-password") {
  const res = await resetPassword(
    post("/api/auth/reset-password", { email, code, new_password: newPassword }),
  );
  return { status: res.status, body: await res.json() };
}

async function memberEmail(): Promise<{ id: string; email: string }> {
  const user = await createTestUser();
  return prisma.user.findUniqueOrThrow({
    where: { id: user.userId },
    select: { id: true, email: true },
  });
}

/** A six-digit code guaranteed not to be the real one. */
function wrongCode(code: string): string {
  return code === "111111" ? "222222" : "111111";
}

describe("password reset codes", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("stores a keyed hash of the code, never the code", async () => {
    const { id, email } = await memberEmail();
    const code = await requestCode(email);

    const row = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { resetCodeHash: true, resetCodeAttempts: true },
    });
    expect(row.resetCodeHash).toBe(hashResetCode(code));
    expect(row.resetCodeHash).not.toContain(code);
    expect(row.resetCodeAttempts).toBe(0);
  });

  it("resets the password with the right code and clears the code", async () => {
    const { id, email } = await memberEmail();
    const code = await requestCode(email);

    expect((await reset(email, code)).status).toBe(200);
    const row = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { resetCodeHash: true, passwordHash: true },
    });
    expect(row.resetCodeHash).toBeNull();
    expect(await bcrypt.compare("a-brand-new-password", row.passwordHash)).toBe(true);
    expect((await reset(email, code)).status).toBe(400);
  });

  it("wipes the code after 5 wrong guesses, so the right one no longer works", async () => {
    const { id, email } = await memberEmail();
    const code = await requestCode(email);

    for (let i = 0; i < 5; i++) {
      const { status, body } = await reset(email, wrongCode(code));
      expect(status).toBe(400);
      expect(body.error).toBe("Invalid email or reset code.");
    }
    const row = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { resetCodeHash: true },
    });
    expect(row.resetCodeHash).toBeNull();
    expect((await reset(email, code)).status).toBe(400);
  });

  it("still accepts the right code after 4 wrong guesses", async () => {
    const { email } = await memberEmail();
    const code = await requestCode(email);

    for (let i = 0; i < 4; i++) await reset(email, wrongCode(code));
    expect((await reset(email, code)).status).toBe(200);
  });

  it("starts the count over when a new code is requested", async () => {
    const { email } = await memberEmail();
    const first = await requestCode(email);
    for (let i = 0; i < 4; i++) await reset(email, wrongCode(first));

    const second = await requestCode(email);
    await reset(email, wrongCode(second));
    expect((await reset(email, second)).status).toBe(200);
  });

  it("refuses a new password over 128 characters", async () => {
    const { email } = await memberEmail();
    const code = await requestCode(email);

    const { status, body } = await reset(email, code, "a".repeat(129));
    expect(status).toBe(400);
    expect(body.error).toBe("Password must be 128 characters or fewer.");
    expect((await reset(email, code, "a".repeat(128))).status).toBe(200);
  });
});
