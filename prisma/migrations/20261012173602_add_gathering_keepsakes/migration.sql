-- CreateTable
CREATE TABLE "gathering_keepsakes" (
    "id" TEXT NOT NULL,
    "gathering_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gathering_keepsakes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gathering_keepsakes_user_id_idx" ON "gathering_keepsakes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "gathering_keepsakes_gathering_id_user_id_key" ON "gathering_keepsakes"("gathering_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "gathering_keepsakes_gathering_id_ordinal_key" ON "gathering_keepsakes"("gathering_id", "ordinal");

-- AddForeignKey
ALTER TABLE "gathering_keepsakes" ADD CONSTRAINT "gathering_keepsakes_gathering_id_fkey" FOREIGN KEY ("gathering_id") REFERENCES "gatherings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gathering_keepsakes" ADD CONSTRAINT "gathering_keepsakes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
