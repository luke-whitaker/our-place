import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTE_MAX_CHARS } from "@/lib/items";
import { METRICS_LETTER } from "@/lib/metrics-letter";

// Existing members got the letter from a migration, new members from the admin
// route. Both must read the same, or members would compare different letters.
const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20260930194100_metrics_letter/migration.sql",
);

describe("metrics letter", () => {
  it("fits in a note", () => {
    expect(METRICS_LETTER.length).toBeLessThanOrEqual(NOTE_MAX_CHARS);
  });

  it("matches the migration's text exactly", () => {
    const sqlLiteral = `'${METRICS_LETTER.replaceAll("'", "''")}'`;
    expect(readFileSync(MIGRATION, "utf8")).toContain(sqlLiteral);
  });

  it("names the switch exactly as Account settings labels it", () => {
    expect(METRICS_LETTER).toContain('"Leave me out of activity counts."');
  });
});
