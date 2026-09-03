import { configDefaults, defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

// `.mts` makes this file real ESM, so there's no ambient `__dirname` — derive
// it from `import.meta.url` instead of relying on `import.meta.dirname`
// (Node 20.11+/21.2+ only), which would break on the `engines`-pinned floor.
const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Route tests need a real Postgres — they run separately under
    // vitest.routes.config.mts (npm run test:routes) so plain `npm run test`
    // never needs a database.
    exclude: [...configDefaults.exclude, "src/**/*.route.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});
