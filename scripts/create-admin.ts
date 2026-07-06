// Bootstrap a loginable admin account on the LOCAL dev database.
//
// Account creation normally requires an existing admin (see
// src/app/api/admin/users/route.ts), and the seed's system user has a
// placeholder hash — so a fresh dev DB has no way in. This script is that
// way in. It mirrors the admin-create route (same validation, phone
// normalization, bcrypt rounds, avatar color) but sets role "admin".
//
// Usage (all flags optional — sensible dev defaults shown):
//   npm run db:create-admin
//   npm run db:create-admin -- --username luke --password supersecret --email luke@local.test
//
// Safety: refuses to run unless DATABASE_URL points at localhost, so the
// known dev password can never be planted in production. Override with
// --force only if you truly mean to target a remote DB.

import "dotenv/config";
import { parseArgs } from "node:util";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createUserSchema, getZodErrorMessage, normalizePhone } from "../src/lib/schemas";
import { AVATAR_COLORS } from "../src/lib/types";

const { values } = parseArgs({
  options: {
    username: { type: "string", default: "admin" },
    "display-name": { type: "string", default: "Admin" },
    email: { type: "string", default: "admin@local.test" },
    phone: { type: "string" },
    password: { type: "string", default: "localdev123" },
    force: { type: "boolean", default: false },
  },
});

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL is not set. Start the dev DB (docker compose up -d) first.");
  process.exit(1);
}

const host = new URL(dbUrl).hostname;
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
if (!isLocal && !values.force) {
  console.error(`Refusing to create an admin against a non-local database (host: ${host}).`);
  console.error(
    "This plants a known dev password — local DBs only. Re-run with --force to override.",
  );
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg(dbUrl) });

async function main() {
  const parsed = createUserSchema.safeParse({
    username: values.username,
    display_name: values["display-name"],
    email: values.email,
    phone: values.phone,
    password: values.password,
  });
  if (!parsed.success) {
    console.error(`Invalid input: ${getZodErrorMessage(parsed)}`);
    process.exitCode = 1;
    return;
  }

  const { display_name, username, email, phone, password } = parsed.data;
  const phoneClean = phone === undefined ? null : normalizePhone(phone);
  const usernameLower = username.toLowerCase();
  const emailLower = email.toLowerCase();

  const existingUsername = await prisma.user.findFirst({
    where: { username: { equals: usernameLower, mode: "insensitive" } },
    select: { username: true, role: true },
  });
  if (existingUsername) {
    console.log(
      `User "${existingUsername.username}" already exists (role: ${existingUsername.role}) — ` +
        `just log in with it, or pass a different --username.`,
    );
    return;
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email: emailLower },
    select: { username: true },
  });
  if (existingEmail) {
    console.error(
      `Email ${emailLower} is already used by "${existingEmail.username}". Pass --email.`,
    );
    process.exitCode = 1;
    return;
  }

  if (phoneClean) {
    const existingPhone = await prisma.user.findUnique({
      where: { phone: phoneClean },
      select: { username: true },
    });
    if (existingPhone) {
      console.error(
        `Phone ${phoneClean} is already used by "${existingPhone.username}". Pass --phone.`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

  const user = await prisma.user.create({
    data: {
      username: usernameLower,
      displayName: display_name,
      email: emailLower,
      phone: phoneClean,
      passwordHash,
      avatarColor,
      role: "admin",
      isVerified: true,
    },
  });

  console.log("\nAdmin account created ✓");
  console.log(`  username: ${user.username}`);
  console.log(`  password: ${password}  (dev credential — fine to commit/share)`);
  console.log(`  role:     ${user.role}`);
  console.log("\nLog in at http://localhost:3000/auth/login, then create accounts at /admin.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
