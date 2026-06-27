import { describe, it, expect } from "vitest";
import {
  DIR8_ALL,
  DIR8_ROW,
  WALK_FRAME_COUNT,
  SHEET,
  vectorToDir8,
  walkFrameIndex,
} from "./character-sheet";

describe("character-sheet geometry", () => {
  it("has 8 facings, each mapped to a distinct row within the sheet", () => {
    expect(DIR8_ALL).toHaveLength(8);
    const rows = DIR8_ALL.map((d) => DIR8_ROW[d]);
    expect(new Set(rows).size).toBe(8);
    expect(Math.max(...rows)).toBeLessThan(SHEET.rows);
  });

  it("walk cycle uses columns 1..8 (idle is column 0)", () => {
    expect(SHEET.idleCol).toBe(0);
    expect(WALK_FRAME_COUNT).toBe(8);
    expect(SHEET.walkCols).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("vectorToDir8", () => {
  it("maps the cardinal screen directions (y points down)", () => {
    expect(vectorToDir8(0, 1)).toBe("S");
    expect(vectorToDir8(0, -1)).toBe("N");
    expect(vectorToDir8(1, 0)).toBe("E");
    expect(vectorToDir8(-1, 0)).toBe("W");
  });

  it("maps the diagonals", () => {
    expect(vectorToDir8(1, 1)).toBe("SE");
    expect(vectorToDir8(-1, 1)).toBe("SW");
    expect(vectorToDir8(1, -1)).toBe("NE");
    expect(vectorToDir8(-1, -1)).toBe("NW");
  });

  it("returns null for a zero vector so the caller keeps its facing", () => {
    expect(vectorToDir8(0, 0)).toBeNull();
  });
});

describe("walkFrameIndex", () => {
  it("advances one frame every `ticksPerFrame` ticks and wraps the cycle", () => {
    expect(walkFrameIndex(0, 10)).toBe(0);
    expect(walkFrameIndex(9, 10)).toBe(0);
    expect(walkFrameIndex(10, 10)).toBe(1);
    expect(walkFrameIndex(75, 10)).toBe(7);
    expect(walkFrameIndex(80, 10)).toBe(0); // wraps after 8 frames
  });
});
