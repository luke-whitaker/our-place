-- Reset codes were stored in plain text. Dropping the column invalidates any
-- code still outstanding (they last 30 minutes); the member asks for a new one.
ALTER TABLE "users" DROP COLUMN "reset_code",
ADD COLUMN     "reset_code_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reset_code_hash" TEXT;

-- The expiry belonged to the dropped codes.
UPDATE "users" SET "reset_code_expires_at" = NULL WHERE "reset_code_expires_at" IS NOT NULL;
