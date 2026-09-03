import { describe, it, expect } from "vitest";
import {
  parseIsoWorld,
  OBJECT_CATALOG,
  SOLID_TERRAIN,
  TERRAIN_KINDS,
  type IsoWorld,
} from "./world-model";
import { LAB_TOWN } from "./worlds/lab-town";
import { CAPITAL } from "./worlds/capital";

describe("terrain", () => {
  it("exposes the ground kinds and marks only water and void solid", () => {
    expect(TERRAIN_KINDS).toContain("grass");
    expect(SOLID_TERRAIN.has("water")).toBe(true);
    expect(SOLID_TERRAIN.has("void")).toBe(true);
    expect(SOLID_TERRAIN.has("grass")).toBe(false);
  });
});

describe("OBJECT_CATALOG", () => {
  it("defines every kind the lab fixture places", () => {
    for (const obj of LAB_TOWN.objects) {
      expect(OBJECT_CATALOG[obj.kind]).toBeDefined();
    }
  });

  it("defines every kind the Capital places", () => {
    for (const obj of CAPITAL.objects) {
      expect(OBJECT_CATALOG[obj.kind]).toBeDefined();
    }
  });

  it("gives each object a non-empty footprint and a tint target", () => {
    for (const def of Object.values(OBJECT_CATALOG)) {
      expect(def.footprint.length).toBeGreaterThan(0);
      expect(["nature", "evergreen", "building", "ground"]).toContain(def.tint);
    }
    expect(OBJECT_CATALOG.pine1.tint).toBe("evergreen");
    expect(OBJECT_CATALOG.cottage_blue.tint).toBe("building");
  });
});

describe("parseIsoWorld", () => {
  it("accepts the lab fixture round-trip", () => {
    expect(() => parseIsoWorld(LAB_TOWN)).not.toThrow();
    expect(parseIsoWorld(LAB_TOWN).cols).toBe(LAB_TOWN.cols);
  });

  it("rejects terrain whose row count disagrees with rows", () => {
    const bad: IsoWorld = { ...LAB_TOWN, terrain: LAB_TOWN.terrain.slice(0, -1) };
    expect(() => parseIsoWorld(bad)).toThrow(/terrain has/);
  });

  it("rejects terrain whose column count disagrees with cols", () => {
    const trimmed = LAB_TOWN.terrain.map((row) => row.slice());
    trimmed[0] = trimmed[0].slice(0, -1);
    expect(() => parseIsoWorld({ ...LAB_TOWN, terrain: trimmed })).toThrow(/row 0 has/);
  });

  it("rejects an unknown object kind", () => {
    const bad: IsoWorld = {
      ...LAB_TOWN,
      objects: [...LAB_TOWN.objects, { kind: "dragon", col: 1, row: 1 }],
    };
    expect(() => parseIsoWorld(bad)).toThrow(/unknown kind "dragon"/);
  });

  it("rejects a malformed shape", () => {
    expect(() => parseIsoWorld({ cols: 4 })).toThrow();
  });

  it("accepts a known tint preset and rejects an unknown one", () => {
    expect(parseIsoWorld({ ...LAB_TOWN, tint: "autumn" }).tint).toBe("autumn");
    expect(() => parseIsoWorld({ ...LAB_TOWN, tint: "lava" })).toThrow();
  });

  it("requires an id and validates links", () => {
    const { id: _id, ...noId } = LAB_TOWN;
    void _id;
    expect(() => parseIsoWorld(noId)).toThrow();
    const linked = { ...LAB_TOWN, links: [{ id: "home", label: "Home", place: "me" }] };
    expect(parseIsoWorld(linked).links[0].place).toBe("me");
    expect(() => parseIsoWorld({ ...LAB_TOWN, links: [{ id: "x", label: "X" }] })).toThrow();
  });
});
