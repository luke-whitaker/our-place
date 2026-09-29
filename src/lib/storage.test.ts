import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageConfigError, uploadToStorage } from "./storage";

const body = new ArrayBuffer(4);

describe("uploadToStorage key check", () => {
  // No R2 credentials, so a key that passes the check stops at the config
  // error and nothing can ever reach a real bucket from a test.
  beforeEach(() => {
    for (const name of ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) {
      vi.stubEnv(name, "");
    }
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    "images/x.a/%2e%2e/%2e%2e/%2e%2e/other-bucket/evil",
    "images/x.a/../world/objects/armoire.png",
    "images/./photo.png",
    "/images/photo.png",
    "images//photo.png",
    "images/photo",
    "images/photo.png?x=1",
    "images/my photo.png",
  ])("refuses %s", async (key) => {
    await expect(uploadToStorage(key, body, "image/png")).rejects.toThrow(/unsafe storage key/);
  });

  it.each([
    "images/0b7c9a7e-4c1d-4d0e-9a51-2f3e8d6c1a2b.jpg",
    "videos/0b7c9a7e-4c1d-4d0e-9a51-2f3e8d6c1a2b.mov",
    "world/objects/mailbox_red.png",
  ])("lets %s through to the upload", async (key) => {
    await expect(uploadToStorage(key, body, "image/png")).rejects.toBeInstanceOf(
      StorageConfigError,
    );
  });
});
