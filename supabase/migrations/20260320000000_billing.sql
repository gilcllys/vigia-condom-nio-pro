-- Billing: add subscription fields to nfe_vigia.condos
-- subscription_status: trial | active | past_due | canceled
-- All condos start as 'trial' to avoid breaking existing accounts.

ALTER TABLE nfe_vigia.condos
  ADD COLUMN IF NOT EXISTS subscription_status    text        NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_id        text,
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS pagarme_customer_id    text;

-- Index for webhook lookups by subscription_id
CREATE INDEX IF NOT EXISTS condos_subscription_id_idx
  ON nfe_vigia.condos (subscription_id)
  WHERE subscription_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN nfe_vigia.condos.subscription_status IS
  'trial = within free trial, active = paid and current, past_due = payment failed, canceled = no longer subscribed';
