import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { TRUSTED_DEVICE_COOKIE } from "@/lib/auth";
import { createTestUser } from "@/test/route-helpers";
import { POST } from "./route";

const PASSWORD = "correct-horse-battery";

// The per-IP limiter would stop a test long before the per-account one, so by
// default every request comes from a new address, as a botnet's or an IPv6
// range's would. Pass `ip` to share one, as a household's Wi-Fi does.
let nextIp = 0;
async function login(loginName: string, password: string, trustedDevice?: string, ip?: string) {
  nextIp += 1;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Forwarded-For": ip ?? `10.1.${Math.floor(nextIp / 250)}.${nextIp % 250}`,
  };
  if (trustedDevice) headers.Cookie = `${TRUSTED_DEVICE_COOKIE}=${trustedDevice}`;
  const request = new NextRequest(new URL("http://localhost/api/auth/login"), {
    method: "POST",
    headers,
    body: JSON.stringify({ login: loginName, password }),
  });
  const res = await POST(request);
  return {
    status: res.status,
    body: await res.json(),
    trustedDevice: res.cookies.get(TRUSTED_DEVICE_COOKIE)?.value,
  };
}

async function failTenTimes(loginName: string) {
  for (let i = 0; i < 10; i++) {
    expect((await login(loginName, "wrong-password")).status).toBe(401);
  }
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
  return { userId: user.userId, username: user.username, email };
}

describe("POST /api/auth/login per-account limit", () => {
  it("signs a member in with the right password", async () => {
    const { username } = await memberWithPassword();
    const { status } = await login(username, PASSWORD);
    expect(status).toBe(200);
  });

  it("locks a new browser out after 10 failures, even from new addresses and with the right password", async () => {
    const { username } = await memberWithPassword();
    await failTenTimes(username);
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
    await failTenTimes("nobody_here");
    expect((await login("nobody_here", "wrong-password")).status).toBe(429);
  });

  it("never counts a successful sign-in", async () => {
    const { username } = await memberWithPassword();
    for (let i = 0; i < 12; i++) {
      expect((await login(username, PASSWORD)).status).toBe(200);
    }
  });

  it("lets the member in from a browser they signed in from before, while strangers are locked out", async () => {
    const { username } = await memberWithPassword();
    const { trustedDevice } = await login(username, PASSWORD);
    expect(trustedDevice).toBeTruthy();
    await failTenTimes(username);
    expect((await login(username, PASSWORD)).status).toBe(429);
    expect((await login(username, PASSWORD, trustedDevice)).status).toBe(200);
  });

  it("lets the member in from their own browser on the same Wi-Fi a stranger exhausted", async () => {
    const { username } = await memberWithPassword();
    const sharedIp = "10.2.0.1";
    const { trustedDevice } = await login(username, PASSWORD, undefined, sharedIp);
    for (let i = 0; i < 10; i++) {
      expect((await login(username, "wrong-password", undefined, sharedIp)).status).toBe(401);
    }
    expect((await login(username, PASSWORD, undefined, sharedIp)).status).toBe(429);
    expect((await login(username, PASSWORD, trustedDevice, sharedIp)).status).toBe(200);
  });

  it("limits each address to 10 failures across accounts", async () => {
    const sharedIp = "10.3.0.1";
    for (let i = 0; i < 10; i++) {
      expect((await login(`nobody_${i}`, "wrong-password", undefined, sharedIp)).status).toBe(401);
    }
    const { username } = await memberWithPassword();
    expect((await login(username, PASSWORD, undefined, sharedIp)).status).toBe(429);
  });

  it("doesn't trust another member's browser or a tampered cookie", async () => {
    const victim = await memberWithPassword();
    const other = await memberWithPassword();
    const { trustedDevice: othersDevice } = await login(other.username, PASSWORD);
    const { trustedDevice: victimsDevice } = await login(victim.username, PASSWORD);
    await failTenTimes(victim.username);
    expect((await login(victim.username, PASSWORD, othersDevice)).status).toBe(429);
    const tampered = `${victimsDevice!.slice(0, -1)}${victimsDevice!.endsWith("0") ? "1" : "0"}`;
    expect((await login(victim.username, PASSWORD, tampered)).status).toBe(429);
  });

  it("forgets trusted browsers when the password changes", async () => {
    const { userId, username } = await memberWithPassword();
    const { trustedDevice } = await login(username, PASSWORD);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordChangedAt: new Date(Date.now() + 2000) },
    });
    await failTenTimes(username);
    expect((await login(username, PASSWORD, trustedDevice)).status).toBe(429);
  });
});
