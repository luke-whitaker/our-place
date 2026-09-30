-- Admin metrics (v0.18.0): one row per member per active day, and the switch
-- that leaves a member out of them. See ActivityDay in schema.prisma.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "exclude_from_metrics" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "activity_days" (
    "user_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "world_seconds" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_days_pkey" PRIMARY KEY ("user_id","day")
);

-- CreateIndex
CREATE INDEX "activity_days_day_idx" ON "activity_days"("day");

-- AddForeignKey
ALTER TABLE "activity_days" ADD CONSTRAINT "activity_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
