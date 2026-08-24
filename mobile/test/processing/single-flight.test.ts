import assert from "node:assert/strict";
import { test } from "node:test";

import { SingleFlight } from "../../src/core/common/singleFlight";

test("deduplicates concurrent work for the same key", async () => {
  const singleFlight = new SingleFlight<string, string>();
  let calls = 0;
  let release!: (value: string) => void;
  const operation = () => {
    calls += 1;
    return new Promise<string>((resolve) => {
      release = resolve;
    });
  };

  const first = singleFlight.run("image-1", operation);
  const second = singleFlight.run("image-1", operation);
  assert.equal(calls, 1);

  release("cached-uri");
  assert.deepEqual(await Promise.all([first, second]), [
    "cached-uri",
    "cached-uri",
  ]);
});

test("allows retry after a failed operation", async () => {
  const singleFlight = new SingleFlight<string, string>();
  let calls = 0;
  const operation = async () => {
    calls += 1;
    if (calls === 1) throw new Error("network failed");
    return "cached-uri";
  };

  await assert.rejects(
    singleFlight.run("image-1", operation),
    /network failed/,
  );
  assert.equal(await singleFlight.run("image-1", operation), "cached-uri");
  assert.equal(calls, 2);
});
