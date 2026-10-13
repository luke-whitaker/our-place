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

/** Bytes per type: the smallest file each format reader accepts, and anything for the rest. */
const FILES: Record<string, Buffer> = {
  // SOI, an Exif block naming a location, then the image data.
  "image/jpeg": Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x13]),
    Buffer.from("Exif\0\0GPS 41.58 N", "latin1"),
    Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0xff, 0xd9]),
  ]),
  "image/png": Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0,
  ]),
};

/** A multipart upload written by hand, so the filename reaches the route exactly as sent. */
function uploadRequest(filename: string, type: string, file?: Buffer): NextRequest {
  const body = Buffer.concat([
    Buffer.from(
      "--B\r\n" +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${type}\r\n\r\n`,
    ),
    file ?? FILES[type] ?? Buffer.from("a video, as far as the route cares"),
    Buffer.from("\r\n--B--\r\n"),
  ]);
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

  it("stores a photo without its location", async () => {
    const res = await POST(uploadRequest("photo.jpg", "image/jpeg"));
    expect(res.status).toBe(200);
    const stored = Buffer.from(mockUpload.mock.calls[0][1] as Uint8Array);
    expect(stored.includes("GPS")).toBe(false);
    expect(stored.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it("refuses a photo that isn't what its type claims, without uploading", async () => {
    const res = await POST(uploadRequest("photo.jpg", "image/jpeg", Buffer.from("not a photo")));
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
