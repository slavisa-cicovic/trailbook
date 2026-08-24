import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LocationDrainCoordinator,
  LocationWriteBarrier,
} from '../../src/core/data/location/locationDrainCoordinator';

test('stop joins an in-flight 150-location drain before taking its snapshot', async () => {
  const coordinator = new LocationDrainCoordinator();
  const persisted: number[] = [];
  let releaseBatch!: () => void;
  const batchBlocked = new Promise<void>((resolve) => {
    releaseBatch = resolve;
  });
  let drainCalls = 0;

  const drain = () => coordinator.run(async () => {
    drainCalls += 1;
    for (let index = 0; index < 150; index += 1) {
      if (index === 25) await batchBlocked;
      persisted.push(index);
    }
    return 150;
  });

  const callbackDrain = drain();
  const stopDrain = drain();
  await Promise.resolve();
  assert.equal(persisted.length, 25);
  assert.equal(drainCalls, 1);

  releaseBatch();
  await stopDrain;
  assert.equal(persisted.length, 150);
  assert.strictEqual(await callbackDrain, 150);

  await drain();
  assert.equal(drainCalls, 2);
});

test('fallback stop waits for every callback write already in progress', async () => {
  const barrier = new LocationWriteBarrier();
  let releaseWrite!: () => void;
  const blocked = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  const persisted: number[] = [];

  const callback = barrier.run(async () => {
    persisted.push(1);
    await blocked;
    persisted.push(2);
  });
  const stop = barrier.waitForIdle();
  await Promise.resolve();
  assert.deepEqual(persisted, [1]);

  releaseWrite();
  await stop;
  await callback;
  assert.deepEqual(persisted, [1, 2]);
});
