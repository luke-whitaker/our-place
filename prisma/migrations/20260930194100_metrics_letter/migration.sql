-- Luke's letter about the admin metrics (v0.18.0): what is counted, why, and
-- how to opt out. Every existing member gets it in their island mailbox, from
-- the "luke" account, in their lowest free mailbox slot. New members get it
-- when their account is created (POST /api/admin/users). The text must match
-- METRICS_LETTER in src/lib/metrics-letter.ts; metrics-letter.test.ts checks.
--
-- A no-op when the "luke" account doesn't exist (an empty database). Luke
-- himself and the "ourplace" account are skipped, and so is a member whose
-- mailbox is already full (20 items).
INSERT INTO "items" ("id", "owner_id", "kind", "location", "slot", "body", "from_id", "placed_at")
SELECT gen_random_uuid()::text, u."id", 'note', 'mailbox', free.slot, 'Hi! It''s Luke.

Quick heads-up about something new. I''ve started counting the days you visit Our Place, and how long the world stays open while you''re in it. Only totals, never what you read or where you walked. Posts, comments, and letters get counted too, but those are already here as part of the site, so nothing new is being collected about them.

I''m doing this because I want to know whether Our Place is being used, and how. Collecting data points about traffic helps me do that.

If you''d rather not be counted, go to Account settings and turn on "Leave me out of activity counts." No questions, and I won''t mind at all.

Thanks for being here.

Luke', sender."id", CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN (SELECT "id" FROM "users" WHERE "username" = 'luke') sender
CROSS JOIN LATERAL (
    SELECT s AS slot
    FROM generate_series(0, 19) s
    WHERE NOT EXISTS (
        SELECT 1 FROM "items" i
        WHERE i."owner_id" = u."id" AND i."location" = 'mailbox' AND i."slot" = s
    )
    ORDER BY s
    LIMIT 1
) free
WHERE u."id" <> sender."id" AND u."username" <> 'ourplace';
