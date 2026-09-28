import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTE_MAX_CHARS } from "@/lib/items";
import { WELCOME_LETTER } from "@/lib/welcome-letter";

// Existing members got the letter from a migration, new members from the admin
// route. Both must read the same, or members would compare different letters.
const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20260928120000_welcome_letter/migration.sql",
);

describe("welcome letter", () => {
  it("fits in a note", () => {
    expect(WELCOME_LETTER.length).toBeLessThanOrEqual(NOTE_MAX_CHARS);
  });

  it("matches the migration's text exactly", () => {
    const sqlLiteral = `'${WELCOME_LETTER.replaceAll("'", "''")}'`;
    expect(readFileSync(MIGRATION, "utf8")).toContain(sqlLiteral);
  });
});
