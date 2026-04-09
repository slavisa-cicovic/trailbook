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
