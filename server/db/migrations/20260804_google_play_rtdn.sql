CREATE TABLE IF NOT EXISTS google_purchase_notifications (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID         REFERENCES users(id) ON DELETE SET NULL,
    message_id        VARCHAR(255) NOT NULL UNIQUE,
    subscription      VARCHAR(500),
    package_name      VARCHAR(255),
    notification_type INT,
    processing_status VARCHAR(50)  NOT NULL DEFAULT 'received',
    attempt_count     INT          NOT NULL DEFAULT 0,
    last_error        TEXT,
    decoded_payload   JSONB,
    received_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_attempt_at   TIMESTAMPTZ,
    processed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS google_purchase_notifications_status_received_idx
    ON google_purchase_notifications (processing_status, received_at);
CREATE INDEX IF NOT EXISTS google_purchase_notifications_user_received_idx
    ON google_purchase_notifications (user_id, received_at DESC);
