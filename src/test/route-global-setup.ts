import { execFileSync } from "node:child_process";

const DEFAULT_TEST_DATABASE_URL = "postgresql://ourplace:ourplace@localhost:5432/ourplace_test";

/**
 * Vitest runs this once in the main process before spawning test workers,
 * which inherit process.env as it stands once this returns. Setting
 * DATABASE_URL here — rather than in a per-file setup — is what points every
 * route test's Prisma client at the throwaway test database instead of dev
 * or production, and lets `prisma migrate deploy` target the same database
 * before any test runs.
 */
export default function setup() {
  const databaseUrl = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}
