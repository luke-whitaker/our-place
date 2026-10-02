import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAuthUser } from "@/lib/auth";
import { COMMUNITY_DESCRIPTION_MAX, COMMUNITY_GUIDELINES_MAX } from "@/lib/schemas";
import { createTestUser, jsonRequest } from "@/test/route-helpers";
import { POST } from "./route";

// getAuthUser reads cookies via next/headers, which doesn't work outside a
// real Next request, so the caller is chosen per test.
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(), requireAuth: vi.fn() }));
const mockGetAuthUser = vi.mocked(getAuthUser);

async function createCommunity(body: Record<string, unknown>) {
  const res = await POST(jsonRequest("http://localhost/api/communities", body));
  return { status: res.status, body: await res.json() };
}

describe("POST /api/communities text limits", () => {
  beforeEach(async () => {
    mockGetAuthUser.mockReset();
    mockGetAuthUser.mockResolvedValue(await createTestUser());
  });

  const base = { name: "Gardening", description: "Growing food together.", category: "Hobbies" };

  it("creates a community at the limits", async () => {
    const { status } = await createCommunity({
      ...base,
      description: "a".repeat(COMMUNITY_DESCRIPTION_MAX),
      guidelines: "a".repeat(COMMUNITY_GUIDELINES_MAX),
    });
    expect(status).toBe(201);
  });

  it("refuses a description over the limit", async () => {
    const { status, body } = await createCommunity({
      ...base,
      description: "a".repeat(COMMUNITY_DESCRIPTION_MAX + 1),
    });
    expect(status).toBe(400);
    expect(body.error).toBe("Description must be 1000 characters or fewer.");
  });

  it("refuses guidelines over the limit", async () => {
    const { status, body } = await createCommunity({
      ...base,
      guidelines: "a".repeat(COMMUNITY_GUIDELINES_MAX + 1),
    });
    expect(status).toBe(400);
    expect(body.error).toBe("Guidelines must be 5000 characters or fewer.");
  });
});
