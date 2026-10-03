import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { signUnsubscribeToken } from "@/lib/unsubscribe";
import { createTestUser } from "@/test/route-helpers";
import * as routeModule from "./route";

async function post(token: string) {
  const res = await routeModule.POST(
    new NextRequest(`http://localhost/api/unsubscribe?token=${encodeURIComponent(token)}`, {
      method: "POST",
      body: "List-Unsubscribe=One-Click",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }),
  );
  return { status: res.status, data: await res.json() };
}

async function emailsOn(userId: string): Promise<boolean> {
  const row = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { emailGatherings: true },
  });
  return row.emailGatherings;
}

describe("POST /api/unsubscribe", () => {
  it("turns gathering emails off for the member the token names, and only them", async () => {
    const ben = await createTestUser();
    const other = await createTestUser();

    const { status } = await post(signUnsubscribeToken(ben.userId));
    expect(status).toBe(200);
    expect(await emailsOn(ben.userId)).toBe(false);
    expect(await emailsOn(other.userId)).toBe(true);
  });

  it("refuses a made-up, tampered, or missing token and changes nothing", async () => {
    const ben = await createTestUser();
    const other = await createTestUser();
    const otherMac = signUnsubscribeToken(other.userId).split(".")[1];

    for (const token of ["", "nonsense", `${ben.userId}.${otherMac}`, `${ben.userId}.abc`]) {
      expect((await post(token)).status).toBe(400);
    }
    expect(await emailsOn(ben.userId)).toBe(true);
  });

  it("has no GET, so following the link can't unsubscribe anyone", () => {
    expect("GET" in routeModule).toBe(false);
  });
});
