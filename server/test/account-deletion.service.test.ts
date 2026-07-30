import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { AccountDeletionService } from "../src/auth/account-deletion.service";
import type { DatabaseService } from "../src/database/database.service";

const USER_ID = "42a8418c-c454-41ef-ab6f-22991b8af763";
const WAYPOINT_ID = "4f37c143-daad-4490-a0f3-bb9f12b6a944";

describe("AccountDeletionService", () => {
  beforeEach(() => {
    process.env.S3_BUCKET = "test-bucket";
    process.env.S3_REGION = "us-east-1";
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
  });

  test("deletes owned image objects before deleting database records", async () => {
    const calls: string[] = [];
    const deletedKeys: string[][] = [];
    const database = createDatabaseMock(calls);
    const service = new AccountDeletionService(database);
    replaceObjectDeletion(service, async (keys) => {
      calls.push("storage");
      deletedKeys.push(keys);
    });

    await service.deleteAccount(USER_ID);

    assert.deepEqual(deletedKeys, [["media/images/image-1"]]);
    assert.deepEqual(calls, ["storage", "image-rows", "user"]);
  });

  test("keeps database account data when object storage deletion fails", async () => {
    const calls: string[] = [];
    const database = createDatabaseMock(calls);
    const service = new AccountDeletionService(database);
    replaceObjectDeletion(service, async () => {
      throw new Error("storage unavailable");
    });

    await assert.rejects(service.deleteAccount(USER_ID), /storage unavailable/);
    assert.deepEqual(calls, []);
  });
});

function createDatabaseMock(calls: string[]) {
  const transaction = {
    user: {
      delete: async ({ where }: { where: { id: string } }) => {
        assert.equal(where.id, USER_ID);
        calls.push("user");
      },
    },
    waypointImage: {
      deleteMany: async ({ where }: { where: { waypointId: { in: string[] } } }) => {
        assert.deepEqual(where.waypointId.in, [WAYPOINT_ID]);
        calls.push("image-rows");
      },
    },
  };
  return {
    $transaction: async (operation: (client: typeof transaction) => Promise<void>) => {
      await operation(transaction);
    },
    trip: {
      findMany: async () => [
        {
          rawBundle: {
            waypoints: [
              { id: WAYPOINT_ID },
              { id: WAYPOINT_ID },
              { id: null },
            ],
          },
        },
      ],
    },
    waypointImage: {
      findMany: async ({ where }: { where: { waypointId: { in: string[] } } }) => {
        assert.deepEqual(where.waypointId.in, [WAYPOINT_ID]);
        return [{ objectKey: "media/images/image-1" }];
      },
    },
  } as unknown as DatabaseService;
}

function replaceObjectDeletion(
  service: AccountDeletionService,
  implementation: (keys: string[]) => Promise<void>,
) {
  (
    service as unknown as {
      deleteStoredObjects: (keys: string[]) => Promise<void>;
    }
  ).deleteStoredObjects = implementation;
}
