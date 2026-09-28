import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { WELCOME_LETTER, WELCOME_LETTER_SENDER } from "@/lib/welcome-letter";
import { createTestUser, jsonRequest } from "@/test/route-helpers";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn() }));

const mockRequireAdmin = vi.mocked(requireAdmin);

async function createMember(invitedById: string) {
  const res = await POST(
    jsonRequest("http://localhost/api/admin/users", {
      username: "newmember",
      display_name: "New Member",
      email: "new@example.test",
      password: "long-enough-password",
      invited_by_id: invitedById,
    }),
  );
  expect(res.status).toBe(201);
  return (await res.json()).user.id as string;
}

describe("POST /api/admin/users", () => {
  beforeEach(async () => {
    mockRequireAdmin.mockReset();
    const admin = await createTestUser({ role: "admin" });
    mockRequireAdmin.mockResolvedValue({ user: admin });
  });

  it("leaves the welcome letter from Our Place in the new member's mailbox", async () => {
    const sender = await createTestUser({ username: WELCOME_LETTER_SENDER });

    const userId = await createMember(sender.userId);

    const items = await prisma.item.findMany({
      where: { ownerId: userId },
      select: { kind: true, location: true, slot: true, body: true, fromId: true, placedAt: true },
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "note",
      location: "mailbox",
      slot: 0,
      body: WELCOME_LETTER,
      fromId: sender.userId,
    });
    expect(items[0].placedAt).toBeInstanceOf(Date);
  });

  it("still creates the account when the Our Place account doesn't exist", async () => {
    const inviter = await createTestUser();

    const userId = await createMember(inviter.userId);

    expect(await prisma.item.count({ where: { ownerId: userId } })).toBe(0);
  });
});
