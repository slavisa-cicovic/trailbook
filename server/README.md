# Server

This app owns:

- sync ingestion
- DTO validation boundaries
- canonical server persistence
- read APIs for web review

Current auth persistence stack:

- NestJS
- PostgreSQL
- Prisma
- Docker Compose for local database runtime

Local bootstrap:

1. Copy `.env.example` to `.env`
2. Run `npm run db:up --workspace server`
3. Run `npm run db:init --workspace server`
4. Run `npm run prisma:generate --workspace server`
5. Run `npm run start:dev --workspace server`

The local Docker PostgreSQL instance binds to `localhost:55432` to avoid colliding with existing host PostgreSQL ports.
MailHog SMTP/Web UI runs on:

- SMTP: `localhost:1025`
- UI: `http://localhost:8025`

Local MinIO object storage runs on:

- API: `http://localhost:9000`
- Console: `http://localhost:9001`
- Default bucket: `trailbook-media`

To start it:

```bash
npm run media:up --workspace server
```

To store uploaded photos in MinIO instead of the local filesystem, set:

```env
MEDIA_STORAGE_BACKEND="s3"
S3_ENDPOINT="http://localhost:9000"
S3_PUBLIC_ENDPOINT="http://YOUR_LAN_IP:9000"
S3_REGION="us-east-1"
S3_BUCKET="trailbook-media"
S3_ACCESS_KEY_ID="trailbook"
S3_SECRET_ACCESS_KEY="trailbook-secret"
S3_FORCE_PATH_STYLE=true
```

`S3_ENDPOINT` is used by the server. `S3_PUBLIC_ENDPOINT` must be reachable from
the mobile device because presigned upload/download URLs contain this host.

Keep `MEDIA_STORAGE_BACKEND="file"` to use `MEDIA_STORAGE_DIR`.

If you open the web app from another device or via a LAN IP, add that browser origin to `WEB_ALLOWED_ORIGINS`.

Social auth environment:

- `AUTH_BASE_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APPLE_CLIENT_ID`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`

Expected callback URLs:

- Google: `${AUTH_BASE_URL}/api/v1/auth/google/callback`
- Apple: `${AUTH_BASE_URL}/api/v1/auth/apple/callback`

Test bootstrap:

1. Copy `.env.test.example` to `.env.test`
2. Run `npm run db:test:up --workspace server`
3. Run `npm run db:test:init --workspace server`
4. Run `npm run test --workspace server`

The isolated PostgreSQL test instance binds to `localhost:55433`.
