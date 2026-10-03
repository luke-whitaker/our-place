-- AlterTable
ALTER TABLE "items" ADD COLUMN     "color" TEXT;

-- CreateTable
CREATE TABLE "world_plants" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "world_id" TEXT NOT NULL,
    "col" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "planted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blooms_at" TIMESTAMP(3),
    "yields_seed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "world_plants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "world_plants_owner_id_world_id_idx" ON "world_plants"("owner_id", "world_id");

-- CreateIndex
CREATE UNIQUE INDEX "world_plants_world_id_col_row_key" ON "world_plants"("world_id", "col", "row");

-- AddForeignKey
ALTER TABLE "world_plants" ADD CONSTRAINT "world_plants_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
