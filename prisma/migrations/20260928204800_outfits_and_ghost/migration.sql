-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ghost" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "outfits" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "shirt" TEXT NOT NULL,
    "pants" TEXT NOT NULL,
    "shoes" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outfits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outfits_owner_id_slot_key" ON "outfits"("owner_id", "slot");

-- AddForeignKey
ALTER TABLE "outfits" ADD CONSTRAINT "outfits_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
