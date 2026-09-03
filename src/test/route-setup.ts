import { afterEach, afterAll } from "vitest";
import prisma from "@/lib/db";

// Keeps route tests independent of each other. TRUNCATE ... CASCADE empties
// every table with a foreign key back to users or communities (memberships,
// posts, their media/comments/reactions), so each test starts from a clean
// database without needing to know every table a route might touch.
afterEach(async () => {
  await prisma.$executeRaw`TRUNCATE TABLE "users", "communities" RESTART IDENTITY CASCADE`;
});

afterAll(async () => {
  await prisma.$disconnect();
});
