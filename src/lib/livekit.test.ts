import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

// Calls are never recorded (Luke, October 3, 2026). LiveKit records through
// its egress API, so no source file may use it. Generated code and this test
// itself are skipped.
const SRC = join(__dirname, "..");
const SKIP = new Set([join(SRC, "generated"), __filename]);
// The SDK's recording names: its client, its start* calls, and their request
// types. Plain "egress" isn't matched, since R2's egress fees come up too.
const RECORDING = /\bEgressClient\b|\bstart\w*Egress\b|\b\w*EgressRequest\b/;
/** Far beyond the source tree's size; a runaway walk is an error, not a hang. */
const MAX_FILES = 5000;

function sourceFiles(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIP.has(path)) continue;
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
    if (out.length > MAX_FILES) throw new Error(`More than ${MAX_FILES} source files under src.`);
  }
  return out;
}

describe("voice calls are never recorded", () => {
  it("no source file touches LiveKit's egress (recording) API", () => {
    const files = sourceFiles(SRC, []);
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter((f) => RECORDING.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
