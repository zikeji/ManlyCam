-- CreateIndex
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log"("actor_id");

-- CreateIndex
CREATE INDEX "messages_user_id_idx" ON "messages"("user_id");

-- CreateIndex
CREATE INDEX "messages_deleted_by_idx" ON "messages"("deleted_by");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
