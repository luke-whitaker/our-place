import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { createTestUser } from "@/test/route-helpers";
import { POST } from "./route";

const PASSWORD = "correct-horse-battery";

// The per-IP limiter would stop a test long before the per-account one, so
// every request comes from a new address, as a botnet's or an IPv6 range's would.
let nextIp = 0;
async function login(loginName: string, password: string) {
  nextIp += 1;
  const request = new NextRequest(new URL("http://localhost/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.1.0.${nextIp}` },
    body: JSON.stringify({ login: loginName, password }),
  });
  const res = await POST(request);
  return { status: res.status, body: await res.json() };
}

async function memberWithPassword() {
  const user = await createTestUser();
  await prisma.user.update({
    where: { id: user.userId },
    data: { passwordHash: await bcrypt.hash(PASSWORD, 4) },
  });
  const { email } = await prisma.user.findUniqueOrThrow({
    where: { id: user.userId },
    select: { email: true },
  });
  return { username: user.username, email };
}

describe("POST /api/auth/login per-account limit", () => {
  it("signs a member in with the right password", async () => {
    const { username } = await memberWithPassword();
    const { status } = await login(username, PASSWORD);
    expect(status).toBe(200);
  });

  it("locks the account after 10 attempts, even from new addresses and with the right password", async () => {
    const { username } = await memberWithPassword();
    for (let i = 0; i < 10; i++) {
      expect((await login(username, "wrong-password")).status).toBe(401);
    }
    const { status, body } = await login(username, PASSWORD);
    expect(status).toBe(429);
    expect(body.error).toBe("Too many login attempts. Please try again later.");
  });

  it("counts the username and the email against one budget", async () => {
    const { username, email } = await memberWithPassword();
    for (let i = 0; i < 5; i++) await login(username, "wrong-password");
    for (let i = 0; i < 5; i++) await login(email, "wrong-password");
    expect((await login(username.toUpperCase(), PASSWORD)).status).toBe(429);
  });

  it("limits a name with no account the same way, so the two can't be told apart", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await login("nobody_here", "wrong-password")).status).toBe(401);
    }
    expect((await login("nobody_here", "wrong-password")).status).toBe(429);
  });
});
