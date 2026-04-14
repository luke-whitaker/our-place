import { describe, it, expect } from "vitest";
import { parsePagination, paginateResults } from "./pagination";

describe("parsePagination", () => {
  it("returns defaults when no params provided", () => {
    const params = new URLSearchParams();
    expect(parsePagination(params)).toEqual({ page: 1, limit: 30, offset: 0 });
  });

  it("parses page and limit", () => {
    const params = new URLSearchParams("page=3&limit=10");
    expect(parsePagination(params)).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it("clamps limit to max 100", () => {
    const params = new URLSearchParams("limit=500");
    expect(parsePagination(params).limit).toBe(100);
  });

  it("clamps page to min 1", () => {
    const params = new URLSearchParams("page=-5");
    expect(parsePagination(params)).toEqual({ page: 1, limit: 30, offset: 0 });
  });

  it("handles non-numeric values gracefully", () => {
    const params = new URLSearchParams("page=abc&limit=xyz");
    expect(parsePagination(params)).toEqual({ page: 1, limit: 30, offset: 0 });
  });
});

describe("paginateResults", () => {
  it("returns hasMore=false when rows fit within limit", () => {
    const rows = [1, 2, 3];
    const result = paginateResults(rows, 5, 1);
    expect(result).toEqual({ data: [1, 2, 3], hasMore: false, page: 1 });
  });

  it("returns hasMore=true and trims extra row", () => {
    const rows = [1, 2, 3, 4, 5, 6]; // fetched limit+1 = 6
    const result = paginateResults(rows, 5, 1);
    expect(result).toEqual({ data: [1, 2, 3, 4, 5], hasMore: true, page: 1 });
  });

  it("returns exact limit rows with hasMore=false", () => {
    const rows = [1, 2, 3, 4, 5]; // exactly limit, no extra
    const result = paginateResults(rows, 5, 2);
    expect(result).toEqual({ data: [1, 2, 3, 4, 5], hasMore: false, page: 2 });
  });
});
