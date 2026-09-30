-- AlterTable
ALTER TABLE "items" ADD COLUMN     "gathering_id" TEXT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "gathering_id" TEXT;

-- CreateTable
CREATE TABLE "gatherings" (
    "id" TEXT NOT NULL,
    "host_id" TEXT NOT NULL,
    "community_id" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gatherings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gathering_invites" (
    "id" TEXT NOT NULL,
    "gathering_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gathering_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gatherings_community_id_starts_at_idx" ON "gatherings"("community_id", "starts_at");

-- CreateIndex
CREATE INDEX "gatherings_host_id_idx" ON "gatherings"("host_id");

-- CreateIndex
CREATE INDEX "gatherings_starts_at_idx" ON "gatherings"("starts_at");

-- CreateIndex
CREATE INDEX "gathering_invites_user_id_status_idx" ON "gathering_invites"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gathering_invites_gathering_id_user_id_key" ON "gathering_invites"("gathering_id", "user_id");

-- CreateIndex
CREATE INDEX "items_gathering_id_idx" ON "items"("gathering_id");

-- CreateIndex
CREATE INDEX "notifications_gathering_id_idx" ON "notifications"("gathering_id");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_gathering_id_fkey" FOREIGN KEY ("gathering_id") REFERENCES "gatherings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_gathering_id_fkey" FOREIGN KEY ("gathering_id") REFERENCES "gatherings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gatherings" ADD CONSTRAINT "gatherings_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gatherings" ADD CONSTRAINT "gatherings_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gathering_invites" ADD CONSTRAINT "gathering_invites_gathering_id_fkey" FOREIGN KEY ("gathering_id") REFERENCES "gatherings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gathering_invites" ADD CONSTRAINT "gathering_invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
