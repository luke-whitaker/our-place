-- DropIndex
DROP INDEX "items_owner_id_slot_key";

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "from_id" TEXT,
ADD COLUMN     "location" TEXT NOT NULL DEFAULT 'pocket',
ADD COLUMN     "placed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "items_from_id_idx" ON "items"("from_id");

-- CreateIndex
CREATE UNIQUE INDEX "items_owner_id_location_slot_key" ON "items"("owner_id", "location", "slot");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
