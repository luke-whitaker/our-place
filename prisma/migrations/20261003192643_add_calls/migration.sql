-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "call_id" TEXT;

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "started_by" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_invites" (
    "id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "invited_by" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calls_ended_at_idx" ON "calls"("ended_at");

-- CreateIndex
CREATE INDEX "calls_started_at_idx" ON "calls"("started_at");

-- CreateIndex
CREATE INDEX "call_invites_user_id_status_idx" ON "call_invites"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "call_invites_call_id_user_id_key" ON "call_invites"("call_id", "user_id");

-- CreateIndex
CREATE INDEX "notifications_call_id_idx" ON "notifications"("call_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_invites" ADD CONSTRAINT "call_invites_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_invites" ADD CONSTRAINT "call_invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_invites" ADD CONSTRAINT "call_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
