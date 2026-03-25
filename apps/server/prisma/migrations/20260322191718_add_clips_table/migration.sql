-- CreateTable
CREATE TABLE "clips" (
    "id" CHAR(26) NOT NULL,
    "user_id" CHAR(26) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "thumbnail_key" TEXT,
    "duration_seconds" INTEGER,
    "show_clipper" BOOLEAN NOT NULL DEFAULT false,
    "show_clipper_avatar" BOOLEAN NOT NULL DEFAULT false,
    "clipper_name" VARCHAR(50),
    "clipper_avatar_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,
    "last_edited_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "clips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clips_user_id_idx" ON "clips"("user_id");

-- AddForeignKey
ALTER TABLE "clips" ADD CONSTRAINT "clips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
