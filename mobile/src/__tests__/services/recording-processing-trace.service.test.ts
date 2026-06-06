import { describe, expect, it } from "vitest";

import {
  countDuplicateRecordedAtValues,
  getMaxRecordedAtGapMs,
  getTraceRecordedAtRange,
} from "../../services/recording/recording-processing-trace.service";

describe("recording processing trace helpers", () => {
  it("counts duplicate recordedAt values without hiding unique samples", () => {
    expect(
      countDuplicateRecordedAtValues([
        "2026-06-02T09:01:00.000Z",
        "2026-06-02T09:01:00.000Z",
        "2026-06-02T09:02:00.000Z",
        "2026-06-02T09:02:00.000Z",
        "2026-06-02T09:03:00.000Z",
      ]),
    ).toBe(2);
  });

  it("computes max gap from recordedAt values in chronological order", () => {
    expect(
      getMaxRecordedAtGapMs([
        "2026-06-02T09:05:00.000Z",
        "2026-06-02T09:01:00.000Z",
        "2026-06-02T09:02:00.000Z",
      ]),
    ).toBe(3 * 60 * 1000);
  });

  it("returns first and last recordedAt from unsorted input", () => {
    expect(
      getTraceRecordedAtRange([
        "2026-06-02T09:05:00.000Z",
        "2026-06-02T09:01:00.000Z",
        "2026-06-02T09:02:00.000Z",
      ]),
    ).toEqual({
      firstRecordedAt: "2026-06-02T09:01:00.000Z",
      lastRecordedAt: "2026-06-02T09:05:00.000Z",
    });
  });
});

