-- CreateIndex
CREATE INDEX "audit_log_performed_at_idx" ON "audit_log"("performed_at");

-- CreateIndex
CREATE INDEX "clips_created_at_idx" ON "clips"("created_at");

-- CreateIndex
CREATE INDEX "clips_status_idx" ON "clips"("status");

-- CreateIndex
CREATE INDEX "messages_deleted_at_id_idx" ON "messages"("deleted_at", "id");
