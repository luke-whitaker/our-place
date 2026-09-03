-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "allow_comments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allow_dislikes" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allow_reactions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "dislike_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "biome" TEXT NOT NULL DEFAULT 'forest',
ADD COLUMN     "island_visibility" TEXT NOT NULL DEFAULT 'friends';
