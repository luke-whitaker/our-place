-- Friend requests sent before notifications existed: give each one still
-- pending a notification for the person it was sent to, dated when it was
-- sent, so a request that has waited for weeks finally shows up. Accepted
-- friendships and reactions or comments from before get nothing; only a
-- request still needs an answer. Idempotent: skips a request that already has one.
INSERT INTO "notifications" ("id", "recipient_id", "actor_id", "kind", "friendship_id", "created_at")
SELECT gen_random_uuid()::text, f."friend_id", f."user_id", 'friend_request', f."id", f."created_at"
FROM "friendships" f
WHERE f."status" = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM "notifications" n
    WHERE n."friendship_id" = f."id" AND n."kind" = 'friend_request'
  );
