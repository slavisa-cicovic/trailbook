CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email        VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    role         VARCHAR(50)  NOT NULL DEFAULT 'user',
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
