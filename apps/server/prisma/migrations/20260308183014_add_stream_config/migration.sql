-- CreateTable
CREATE TABLE "stream_config" (
    "id" TEXT NOT NULL,
    "admin_toggle" TEXT NOT NULL DEFAULT 'live',
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stream_config_pkey" PRIMARY KEY ("id")
);
