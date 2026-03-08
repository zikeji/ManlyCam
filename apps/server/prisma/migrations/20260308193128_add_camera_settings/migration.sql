-- CreateTable
CREATE TABLE "camera_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "camera_settings_pkey" PRIMARY KEY ("key")
);
