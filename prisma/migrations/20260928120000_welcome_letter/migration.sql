-- The welcome letter from Our Place: how to keep Our Place on a home screen.
-- Every existing member gets it in their island mailbox, from the "ourplace"
-- account, in their lowest free mailbox slot. New members get it when their
-- account is created (POST /api/admin/users). The text must match
-- WELCOME_LETTER in src/lib/welcome-letter.ts; welcome-letter.test.ts checks.
--
-- A no-op when the "ourplace" account doesn't exist (an empty database). A
-- member whose mailbox is already full (20 items) is skipped.
INSERT INTO "items" ("id", "owner_id", "kind", "location", "slot", "body", "from_id", "placed_at")
SELECT gen_random_uuid()::text, u."id", 'note', 'mailbox', free.slot, 'Hello, friend. We are Our Place.

You found your mailbox. Good. Letters are how we like to talk.

You can keep us on your home screen, like an app. We open without the browser around us, so the world fills your whole screen.

iPhone or iPad (Safari): tap Share, then Add to Home Screen.
Android (Chrome): tap the menu, then Install app.
Laptop (Chrome or Edge): click the install icon at the right of the address bar. On a Mac in Safari: File, then Add to Dock.

The first time you open us from your home screen, sign in once more. Your place in the world is remembered separately there.

We will see you around.', sender."id", CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN (SELECT "id" FROM "users" WHERE "username" = 'ourplace') sender
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
WHERE u."id" <> sender."id";
