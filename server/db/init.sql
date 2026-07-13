CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email        VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    role         VARCHAR(50)  NOT NULL DEFAULT 'user',
    apple_app_account_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_token_idx ON refresh_tokens (token);

CREATE TABLE IF NOT EXISTS purchase_access (
    user_id                 UUID         PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    plan_code               VARCHAR(100) NOT NULL,
    subscription_status     VARCHAR(50)  NOT NULL,
    provider                VARCHAR(50),
    environment             VARCHAR(50),
    provider_product_id     VARCHAR(255),
    original_transaction_id VARCHAR(255),
    auto_renew_enabled      BOOLEAN,
    current_period_ends_at  TIMESTAMPTZ,
    revoked_at              TIMESTAMPTZ,
    verified_at             TIMESTAMPTZ,
    entitlements            JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_access_apple_original_transaction_key
    ON purchase_access (original_transaction_id)
    WHERE provider = 'apple' AND original_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS purchase_events (
    id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider                VARCHAR(50)  NOT NULL,
    environment             VARCHAR(50)  NOT NULL,
    provider_product_id     VARCHAR(255) NOT NULL,
    transaction_id          VARCHAR(255) NOT NULL,
    original_transaction_id VARCHAR(255),
    event_type              VARCHAR(50)  NOT NULL,
    result                  VARCHAR(50)  NOT NULL,
    purchased_at            TIMESTAMPTZ,
    expires_at              TIMESTAMPTZ,
    revoked_at              TIMESTAMPTZ,
    idempotency_key         VARCHAR(500) NOT NULL UNIQUE,
    raw_payload             JSONB        NOT NULL,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS purchase_events_user_created_at_idx
    ON purchase_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_events_original_transaction_idx
    ON purchase_events (provider, original_transaction_id);
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

CREATE TABLE IF NOT EXISTS trips (
    id                 BIGSERIAL    PRIMARY KEY,
    client_trip_id     VARCHAR(36)  NOT NULL,
    title              VARCHAR(500) NOT NULL,
    description        TEXT,
    started_at         TIMESTAMPTZ  NOT NULL,
    ended_at           TIMESTAMPTZ,
    status             VARCHAR(50)  NOT NULL,
    processing_version INT          NOT NULL DEFAULT 0,
    raw_bundle         JSONB        NOT NULL,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ,
    user_id            VARCHAR(50)  NOT NULL,
    CONSTRAINT trips_client_trip_id_key UNIQUE (client_trip_id)
);

CREATE INDEX IF NOT EXISTS trips_started_at_idx ON trips (started_at DESC);
CREATE INDEX IF NOT EXISTS trips_user_id_idx ON trips (user_id);

CREATE TABLE IF NOT EXISTS waypoint_images (
    id          VARCHAR(36)  PRIMARY KEY,
    waypoint_id VARCHAR(36)  NOT NULL,
    object_key  TEXT         NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS waypoint_images_waypoint_id_idx ON waypoint_images (waypoint_id);

INSERT INTO users (email, display_name, role) VALUES
    ('scaichat@gmail.com',       'sc',      'admin'),
    ('regmu10@gmail.com',        'Gerum',   'user'),
    ('anci.cicovic@gmail.com',   'Ana',     'user'),
    ('slavisacicovic@gmail.com', 'Slavisa', 'test_user')
ON CONFLICT (email) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role;
