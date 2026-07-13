BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS apple_app_account_token UUID DEFAULT gen_random_uuid();

UPDATE users
SET apple_app_account_token = gen_random_uuid()
WHERE apple_app_account_token IS NULL;

ALTER TABLE users
    ALTER COLUMN apple_app_account_token SET DEFAULT gen_random_uuid(),
    ALTER COLUMN apple_app_account_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_apple_app_account_token_key
    ON users (apple_app_account_token);

ALTER TABLE purchase_access
    ADD COLUMN IF NOT EXISTS auto_renew_enabled BOOLEAN,
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE purchase_access
    DROP CONSTRAINT IF EXISTS purchase_access_provider_original_transaction_key;
DROP INDEX IF EXISTS purchase_access_provider_original_transaction_key;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_access_apple_original_transaction_key
    ON purchase_access (original_transaction_id)
    WHERE provider = 'apple' AND original_transaction_id IS NOT NULL;

ALTER TABLE purchase_events
    DROP CONSTRAINT IF EXISTS purchase_events_provider_transaction_key;

CREATE INDEX IF NOT EXISTS purchase_events_provider_transaction_idx
    ON purchase_events (provider, transaction_id);

CREATE TABLE IF NOT EXISTS apple_purchase_notifications (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID         REFERENCES users(id) ON DELETE SET NULL,
    notification_uuid VARCHAR(100) UNIQUE,
    payload_hash      VARCHAR(64)  NOT NULL UNIQUE,
    signed_payload    TEXT         NOT NULL,
    environment       VARCHAR(50),
    notification_type VARCHAR(100),
    subtype           VARCHAR(100),
    processing_status VARCHAR(50)  NOT NULL DEFAULT 'received',
    attempt_count     INT          NOT NULL DEFAULT 0,
    last_error        TEXT,
    decoded_payload   JSONB,
    received_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_attempt_at   TIMESTAMPTZ,
    processed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS apple_purchase_notifications_status_received_idx
    ON apple_purchase_notifications (processing_status, received_at);
CREATE INDEX IF NOT EXISTS apple_purchase_notifications_user_received_idx
    ON apple_purchase_notifications (user_id, received_at DESC);

COMMIT;
