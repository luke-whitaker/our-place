import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { uploadToStorage } from "@/lib/storage";
import { createTestUser } from "@/test/route-helpers";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn() }));
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  uploadToStorage: vi.fn(async (key: string) => `https://media.example.test/${key}`),
}));

const mockGetAuthUser = vi.mocked(getAuthUser);
const mockUpload = vi.mocked(uploadToStorage);

/** A multipart upload written by hand, so the filename reaches the route exactly as sent. */
function uploadRequest(filename: string, type: string): NextRequest {
  const body =
    "--B\r\n" +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${type}\r\n\r\n` +
    "not really an image\r\n" +
    "--B--\r\n";
  return new NextRequest("http://localhost/api/upload", {
    method: "POST",
    body,
    headers: { "content-type": "multipart/form-data; boundary=B" },
  });
}

describe("POST /api/upload", () => {
  beforeEach(async () => {
    mockUpload.mockClear();
    mockGetAuthUser.mockResolvedValue(await createTestUser());
  });

  it("names the object from its type, ignoring the filename", async () => {
    const res = await POST(uploadRequest("holiday.PNG", "image/jpeg"));
    expect(res.status).toBe(200);
    const [key] = mockUpload.mock.calls[0];
    expect(key).toMatch(/^images\/[0-9a-f-]{36}\.jpg$/);
  });

  it.each([
    "a.x/%2e%2e/%2e%2e/%2e%2e/other-bucket/evil",
    "a.x/%2e%2e/world/objects/armoire",
    "../../world/objects/armoire.png",
  ])("keeps a hostile filename (%s) inside images/", async (filename) => {
    const res = await POST(uploadRequest(filename, "image/png"));
    expect(res.status).toBe(200);
    const [key] = mockUpload.mock.calls[0];
    expect(key).toMatch(/^images\/[0-9a-f-]{36}\.png$/);
  });

  it("files videos under videos/ with their own extension", async () => {
    const res = await POST(uploadRequest("clip.mp4", "video/quicktime"));
    expect(res.status).toBe(200);
    expect(mockUpload.mock.calls[0][0]).toMatch(/^videos\/[0-9a-f-]{36}\.mov$/);
  });

  it("refuses a type we don't accept without uploading anything", async () => {
    const res = await POST(uploadRequest("page.svg", "image/svg+xml"));
    expect(res.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses a logged-out upload", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const res = await POST(uploadRequest("photo.png", "image/png"));
    expect(res.status).toBe(401);
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
