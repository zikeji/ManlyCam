-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "clip_id" CHAR(26),
ADD COLUMN     "message_type" TEXT NOT NULL DEFAULT 'text';

-- CreateIndex
CREATE INDEX "messages_clip_id_idx" ON "messages"("clip_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "clips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
