-- Existing installations: persist the verified metric catalog version used for each assistant message.
ALTER TABLE app_identity.messages
  ADD COLUMN IF NOT EXISTS verified_metric_version VARCHAR(40);
