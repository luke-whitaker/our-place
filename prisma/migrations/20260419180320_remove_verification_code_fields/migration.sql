/*
  Warnings:

  - You are about to drop the column `verification_code` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `verification_expires_at` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "verification_code",
DROP COLUMN "verification_expires_at",
ALTER COLUMN "is_verified" SET DEFAULT true;
