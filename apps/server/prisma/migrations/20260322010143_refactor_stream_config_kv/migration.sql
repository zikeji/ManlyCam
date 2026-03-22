-- Refactor stream_config from single-row typed table to generic key/value store
-- (same pattern as camera_settings)

-- Step 1: Rename existing table to temp (also rename its PK constraint to avoid name clash)
ALTER TABLE "stream_config" RENAME TO "stream_config_old";
ALTER TABLE "stream_config_old" RENAME CONSTRAINT "stream_config_pkey" TO "stream_config_old_pkey";

-- Step 2: Create new key/value table
CREATE TABLE "stream_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stream_config_pkey" PRIMARY KEY ("key")
);

-- Step 3: Migrate existing adminToggle row
INSERT INTO "stream_config" ("key", "value")
SELECT 'adminToggle', "admin_toggle"
FROM "stream_config_old"
WHERE id = 'cfg';

-- Step 4: Drop the temp table
DROP TABLE "stream_config_old";
