# PLAN 68A: Backend Ownership Hardening

## Goal

Before implementing sharing, make backend ownership explicit at database-model level.

The app already passes authenticated `user.id` into trip and group operations, but Prisma currently models ownership as plain strings without relations. Sharing needs stronger guarantees.

## Changes

- `Trip.userId` should be `@db.Uuid` and reference `User.id`.
- `TripGroup.userId` should be `@db.Uuid` and reference `User.id`.
- `TripGroupMember.userId` should be `@db.Uuid` and reference `User.id`.
- `User` should expose relations for owned trips, groups and group members.

## Non-Goals

- No legacy migration work.
- No old-data compatibility.
- No sharing API in this step.

The current project direction is from-scratch schema evolution through Prisma push.

## Validation

- `prisma generate` passes.
- `prisma db push` passes.
- Server typecheck passes.
- Existing trip upload/list/get/delete code still compiles.
- Existing group sync/list code still compiles.

