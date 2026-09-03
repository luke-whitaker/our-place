import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

// See vitest.config.mts for why this is `.mts`.
const dirname = path.dirname(fileURLToPath(import.meta.url));

// A separate config from vitest.config.mts (and its own npm script,
// test:routes) so the plain `npm run test` used by CI's fast path — and by
// anyone without Postgres running — never needs a database.
export default defineConfig({
  test: {
    include: ["src/**/*.route.test.ts"],
    globalSetup: ["./src/test/route-global-setup.ts"],
    setupFiles: ["./src/test/route-setup.ts"],
    // Every test truncates shared tables in afterEach; running files in
    // parallel would let one file's cleanup race another file's test.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});
