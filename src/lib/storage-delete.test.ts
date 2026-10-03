import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteFromStorage, storageKeyFromUrl, StorageUploadError } from "./storage";

// Its own file because storage.ts caches its R2 config per module: these
// tests set fake credentials, which storage.test.ts must never see. The
// endpoint is fake and fetch is mocked, so nothing can reach a real bucket.
const BASE = "https://pub-example.r2.dev";

describe("storageKeyFromUrl", () => {
  it("finds the key of one of our uploads", () => {
    expect(storageKeyFromUrl(`${BASE}/images/abc-123.jpg`, BASE)).toBe("images/abc-123.jpg");
    expect(storageKeyFromUrl(`${BASE}/videos/abc.mov`, `${BASE}/`)).toBe("videos/abc.mov");
  });

  it("ignores links that aren't ours or aren't plain keys", () => {
    expect(storageKeyFromUrl("https://youtu.be/dQw4w9WgXcQ", BASE)).toBeNull();
    expect(storageKeyFromUrl("https://pub-example.r2.dev.evil.com/images/a.jpg", BASE)).toBeNull();
    expect(storageKeyFromUrl(`${BASE}/images/../world/x.png`, BASE)).toBeNull();
    expect(storageKeyFromUrl(`${BASE}/images/a.jpg`, "")).toBeNull();
  });
});

describe("deleteFromStorage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("R2_ENDPOINT", "https://fake-account.example.invalid");
    vi.stubEnv("R2_ACCESS_KEY_ID", "test-key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-secret");
    vi.stubEnv("R2_BUCKET", "test-bucket");
    vi.stubEnv("R2_PUBLIC_BASE_URL", BASE);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends a signed DELETE for the object", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await deleteFromStorage("images/abc-123.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0][0] as Request;
    expect(request.method).toBe("DELETE");
    expect(request.url).toBe("https://fake-account.example.invalid/test-bucket/images/abc-123.jpg");
    expect(request.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256/);
  });

  it("treats a missing object as deleted", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    await expect(deleteFromStorage("images/gone.jpg")).resolves.toBeUndefined();
  });

  it("raises R2's refusal", async () => {
    fetchMock.mockResolvedValue(new Response("AccessDenied", { status: 403 }));
    await expect(deleteFromStorage("images/abc.jpg")).rejects.toBeInstanceOf(StorageUploadError);
  });

  it("refuses an unsafe key before any request", async () => {
    await expect(deleteFromStorage("images/x.a/%2e%2e/world/y.png")).rejects.toThrow(
      /unsafe storage key/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
