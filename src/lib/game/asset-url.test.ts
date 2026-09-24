import { describe, it, expect, afterEach, vi } from "vitest";
import { worldAsset } from "./asset-url";

afterEach(() => vi.unstubAllEnvs());

describe("worldAsset", () => {
  it("returns the path unchanged when no base is configured (dev)", () => {
    vi.stubEnv("NEXT_PUBLIC_WORLD_ASSET_BASE", "");
    expect(worldAsset("/world/objects/house.png")).toBe("/world/objects/house.png");
  });

  it("prefixes an absolute base onto the path", () => {
    vi.stubEnv("NEXT_PUBLIC_WORLD_ASSET_BASE", "https://cdn.example.com");
    expect(worldAsset("/world/tiles/forest.png")).toBe(
      "https://cdn.example.com/world/tiles/forest.png",
    );
  });

  it("versions production art by the deployed commit, so replaced art is refetched", () => {
    vi.stubEnv("NEXT_PUBLIC_WORLD_ASSET_BASE", "https://cdn.example.com");
    vi.stubEnv("NEXT_PUBLIC_ART_VERSION", "13962eac027e1c1799cbd7b44880dcb1b90dfd5a");
    expect(worldAsset("/world/characters/long.png")).toBe(
      "https://cdn.example.com/world/characters/long.png?v=13962eac027e",
    );
  });

  it("leaves local dev art unversioned, since it is never cached across uploads", () => {
    vi.stubEnv("NEXT_PUBLIC_WORLD_ASSET_BASE", "");
    vi.stubEnv("NEXT_PUBLIC_ART_VERSION", "13962eac027e1c1799cbd7b44880dcb1b90dfd5a");
    expect(worldAsset("/world/characters/long.png")).toBe("/world/characters/long.png");
  });

  it("trims a trailing slash on the base so paths join cleanly", () => {
    vi.stubEnv("NEXT_PUBLIC_WORLD_ASSET_BASE", "https://cdn.example.com/");
    expect(worldAsset("/world/tiles/water.png")).toBe(
      "https://cdn.example.com/world/tiles/water.png",
    );
  });
});
