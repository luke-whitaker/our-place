-- CreateTable
CREATE TABLE "world_discoveries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "world_id" TEXT NOT NULL,
    "visited" BYTEA NOT NULL,
    "shrines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "world_discoveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "world_discoveries_user_id_world_id_key" ON "world_discoveries"("user_id", "world_id");

-- AddForeignKey
ALTER TABLE "world_discoveries" ADD CONSTRAINT "world_discoveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
