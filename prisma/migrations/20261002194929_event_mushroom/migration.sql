-- AlterTable
ALTER TABLE "gatherings" ADD COLUMN     "mushroom_col" INTEGER,
ADD COLUMN     "mushroom_row" INTEGER,
ADD COLUMN     "mushroom_world" TEXT,
ADD COLUMN     "planted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "gatherings_mushroom_world_idx" ON "gatherings"("mushroom_world");
