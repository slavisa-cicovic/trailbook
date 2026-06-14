# PLAN 64: MinIO Media Storage

## Goal

Move Trailbook media storage behind an S3-compatible abstraction and use MinIO
locally through Docker.

The first target is only waypoint/trip photos. Mobile should keep using the
existing upload/download API shape; the server decides whether bytes are stored
on local disk or in S3-compatible object storage.

## Current State

Server media storage is filesystem-only:

- `MEDIA_STORAGE_DIR` points to a local directory.
- `MediaStorageService` writes uploaded photos with `writeFile`.
- Attachment content is served through the backend endpoint:
  `/api/trips/attachments/:attachmentId/content`.
- Mobile restores photos by downloading from the backend proxy endpoint.

This is acceptable for local development, but a public server needs durable
object storage semantics, clear backup boundaries, and deployable configuration.

## Decisions

- Use **MinIO** as the local S3-compatible simulator.
- Keep backend-proxy downloads for now. Mobile does not need presigned URLs yet.
- Keep `storageKey` as the canonical object identifier in the database.
- Support both storage backends during transition:
  - `file`
  - `s3`
- Do not migrate existing local files automatically in this plan.
- Do not introduce CDN, public buckets, or direct mobile-to-S3 upload yet.

## Non-Goals

- Do not implement AuthProvider changes.
- Do not implement PurchaseProvider simulation.
- Do not deploy to a public server in this plan.
- Do not change mobile photo UX.
- Do not change trip sync payload semantics.
- Do not require AWS specifically; the target API is S3-compatible.
- Do not make attachments public.

## Target Configuration

Add server environment variables:

```text
MEDIA_STORAGE_BACKEND=file|s3
MEDIA_STORAGE_DIR=/tmp/trailbook-media
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=trailbook-media
S3_ACCESS_KEY_ID=trailbook
S3_SECRET_ACCESS_KEY=trailbook-secret
S3_FORCE_PATH_STYLE=true
```

Rules:

- `MEDIA_STORAGE_BACKEND=file` uses current filesystem behavior.
- `MEDIA_STORAGE_BACKEND=s3` uses MinIO/S3.
- `MEDIA_STORAGE_DIR` remains required only for `file`.
- S3 secrets must not be exposed to mobile.

## Docker Work

Extend local server Docker Compose with MinIO:

- `minio`
  - exposes API on `localhost:9000`
  - exposes console on `localhost:9001`
  - uses a named volume for persistence
- optional `minio-init`
  - waits for MinIO
  - creates `trailbook-media` bucket if missing
  - keeps bucket private

Expected local URLs:

```text
MinIO API:     http://localhost:9000
MinIO Console: http://localhost:9001
```

## Server Architecture

Replace direct filesystem assumptions with a small storage abstraction.

Suggested interface:

```ts
interface MediaObjectStorage {
  putObject(input: {
    key: string;
    body: Buffer;
    contentType?: string | null;
  }): Promise<{ storageKey: string }>;

  getObject(input: {
    key: string;
  }): Promise<{
    body: NodeJS.ReadableStream;
    contentLength?: number | null;
    contentType?: string | null;
  }>;
}
```

Implementations:

- `FileMediaObjectStorage`
- `S3MediaObjectStorage`

`MediaStorageService` can remain the public service used by `TripsService`, but
it should delegate object operations to the configured backend.

## Object Keys

Keep object keys deterministic and private:

```text
trip-attachments/{tripId}/{attachmentId}.{extension}
```

Do not include original filenames in object keys.

Reasons:

- avoids leaking user data
- keeps existing lookup model
- supports idempotent overwrite for the same attachment

## Upload Flow

Keep current flow:

1. Mobile syncs attachment metadata as part of trip sync.
2. Mobile uploads binary to `/trips/:tripId/attachments/upload`.
3. Server validates owner/access.
4. Server writes object to selected storage backend.
5. Server updates `waypoint_attachments.storage_key`.

No mobile changes should be required except config pointing to a backend that
can serve uploaded content.

## Download Flow

Keep current backend proxy endpoint:

1. Mobile requests `/trips/attachments/:attachmentId/content`.
2. Server validates owner/share access.
3. Server opens object by `storageKey`.
4. Server streams bytes to response.

This avoids exposing S3 credentials and avoids direct bucket policy decisions.

Later, if needed, add presigned URLs as a separate plan.

## Tests

### Unit Tests

Add tests for:

- object key generation
- extension detection from MIME type
- backend selection from env
- path traversal protection remains for file backend
- S3 backend calls `PutObject` and `GetObject` with expected bucket/key

### Integration Tests

Keep existing attachment upload/download integration tests green for
filesystem backend.

Add S3/MinIO integration test only if it can run reliably in CI. If not, add a
manual Docker checklist first.

## Manual Verification

Local MinIO flow:

1. Start Docker services.
2. Start server with `MEDIA_STORAGE_BACKEND=s3`.
3. Sync a trip with a waypoint photo.
4. Confirm attachment row has `storage_key`.
5. Confirm object exists in MinIO console.
6. Restore trip on mobile and confirm photo downloads.
7. Share trip and confirm recipient can view photo.
8. Confirm direct unauthenticated content request is rejected.

Regression filesystem flow:

1. Start server with `MEDIA_STORAGE_BACKEND=file`.
2. Upload and restore a photo.
3. Confirm old behavior still works.

## Deployment Notes

For the first public server:

- PostgreSQL and media object storage must be backed by persistent volumes or a
  managed service.
- MinIO can run on the same VM for initial private use.
- Backups must cover both PostgreSQL and the MinIO data volume.
- Public API must be HTTPS before store builds point at it.
- Bucket must remain private.

If later moving to AWS S3, Cloudflare R2, Backblaze B2, or another
S3-compatible provider, only env values should change.

## Acceptance Criteria

- `MEDIA_STORAGE_BACKEND=file` preserves current behavior.
- `MEDIA_STORAGE_BACKEND=s3` stores photos in MinIO.
- Mobile upload/download/restore works without mobile API changes.
- Shared trip photo access rules stay enforced by backend.
- Attachment content is streamed from object storage, not loaded from public
  bucket URLs.
- No S3 credentials appear in mobile config or API responses.
- Local Docker docs explain how to start MinIO and inspect uploaded objects.

## Suggested Implementation Order

1. Add MinIO service and bucket initialization to server Docker Compose.
2. Add server env examples for S3-compatible storage.
3. Introduce media object storage interface.
4. Move current filesystem logic behind `FileMediaObjectStorage`.
5. Add `S3MediaObjectStorage`.
6. Update attachment content endpoint to stream from storage abstraction.
7. Add tests.
8. Update server README with MinIO workflow.
9. Run manual mobile sync/restore test with `MEDIA_STORAGE_BACKEND=s3`.
