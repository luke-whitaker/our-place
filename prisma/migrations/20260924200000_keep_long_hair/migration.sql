-- The builder always saved hairStyle: "short" by default (there was no
-- toggle), but the world only ever drew the long-hair sheet, so every saved
-- "short" is an accident of the default: members chose their colors against
-- long hair. Move those accounts to "long" so their look does not change.
UPDATE "users"
SET "avatar" = jsonb_set("avatar", '{hairStyle}', '"long"')
WHERE "avatar" IS NOT NULL AND "avatar"->>'hairStyle' = 'short';
