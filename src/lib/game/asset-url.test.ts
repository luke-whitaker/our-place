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

  it("trims a trailing slash on the base so paths join cleanly", () => {
    vi.stubEnv("NEXT_PUBLIC_WORLD_ASSET_BASE", "https://cdn.example.com/");
    expect(worldAsset("/world/tiles/water.png")).toBe(
      "https://cdn.example.com/world/tiles/water.png",
    );
  });
});
