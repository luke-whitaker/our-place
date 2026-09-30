import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { createTestUser } from "@/test/route-helpers";
import AdminMetricsPage from "./page";

// getAuthUser reads cookies through next/headers, so the caller is chosen per
// test. redirect() throws in a real render; the mock throws too, so the page
// stops exactly where it would.
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));

const mockGetAuthUser = vi.mocked(getAuthUser);

describe("/admin/metrics", () => {
  beforeEach(() => {
    mockGetAuthUser.mockReset();
    vi.mocked(redirect).mockClear();
  });

  it("sends a member who isn't an admin to the feed before reading any numbers", async () => {
    mockGetAuthUser.mockResolvedValue(await createTestUser());

    await expect(AdminMetricsPage()).rejects.toThrow("redirect:/feed");
  });

  it("sends a logged-out visitor to sign in", async () => {
    mockGetAuthUser.mockResolvedValue(null);

    await expect(AdminMetricsPage()).rejects.toThrow("redirect:/auth/login");
  });

  it("renders for an admin", async () => {
    mockGetAuthUser.mockResolvedValue(await createTestUser({ role: "admin" }));

    await expect(AdminMetricsPage()).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
