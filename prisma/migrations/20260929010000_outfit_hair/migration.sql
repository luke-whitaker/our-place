-- Outfits gain hair: a style (short or long) and a color, beside the clothes.
-- Skin is never part of an outfit.
--
-- Existing outfits take their owner's current hair, so wearing one after this
-- migration changes nothing about how the member looks. An owner without a
-- built character falls back to the builder's defaults (long, dark brown).
ALTER TABLE "outfits" ADD COLUMN "hair_style" TEXT;
ALTER TABLE "outfits" ADD COLUMN "hair_color" TEXT;

UPDATE "outfits" AS o
SET "hair_style" = COALESCE(u."avatar"->>'hairStyle', 'long'),
    "hair_color" = COALESCE(u."avatar"->>'hairColor', '#3b2219')
FROM "users" AS u
WHERE u."id" = o."owner_id";

UPDATE "outfits" SET "hair_style" = 'long' WHERE "hair_style" IS NULL;
UPDATE "outfits" SET "hair_color" = '#3b2219' WHERE "hair_color" IS NULL;

ALTER TABLE "outfits" ALTER COLUMN "hair_style" SET NOT NULL;
ALTER TABLE "outfits" ALTER COLUMN "hair_color" SET NOT NULL;
