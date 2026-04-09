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

If you open the web app from another device or via a LAN IP, add that browser origin to `WEB_ALLOWED_ORIGINS`.

Social auth environment:

- `AUTH_BASE_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APPLE_CLIENT_ID`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`

Expected callback URLs:

- Google: `${AUTH_BASE_URL}/api/auth/google/callback`
- Apple: `${AUTH_BASE_URL}/api/auth/apple/callback`
- Facebook: `${AUTH_BASE_URL}/api/auth/facebook/callback`

Test bootstrap:

1. Copy `.env.test.example` to `.env.test`
2. Run `npm run db:test:up --workspace server`
3. Run `npm run db:test:init --workspace server`
4. Run `npm run test --workspace server`

The isolated PostgreSQL test instance binds to `localhost:55433`.
