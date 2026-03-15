-- Seed the system user for slash command responses
-- ULID 015YP4KB00MANLY0CAM0SYSTEM encodes timestamp 2011-05-01 (Manly's birth month)
INSERT INTO "users" (
  "id",
  "google_sub",
  "email",
  "display_name",
  "avatar_url",
  "role",
  "user_tag_text",
  "user_tag_color",
  "muted_at",
  "banned_at",
  "created_at",
  "last_seen_at"
) VALUES (
  '015YP4KB00MANLY0CAM0SYSTEM',
  'system',
  'system@manlycam.internal',
  'System',
  NULL,
  'System',
  NULL,
  NULL,
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  NULL
) ON CONFLICT ("id") DO NOTHING;
