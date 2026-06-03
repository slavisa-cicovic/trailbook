import { describe, expect, it } from "vitest";

import { scrubSupportBundleValue } from "../../services/support/support-bundle-scrubber.service";

describe("scrubSupportBundleValue", () => {
  it("redacts sensitive object fields without removing useful support context", () => {
    const scrubbed = scrubSupportBundleValue({
      apiBaseUrl: "https://trailbook.example/api?token=abc123&mode=test",
      nested: {
        authorization: "Bearer abc.def.ghi",
        refreshToken: "refresh-secret",
        sessionExpiresAt: "2026-06-03T10:00:00.000Z",
      },
      recordingSession: {
        status: "recording",
        tripLocalId: "trip-1",
      },
      user: {
        email: "demo@example.com",
      },
    });

    expect(scrubbed).toEqual({
      apiBaseUrl: "https://trailbook.example/api?token=[redacted]&mode=test",
      nested: {
        authorization: "[redacted]",
        refreshToken: "[redacted]",
        sessionExpiresAt: "2026-06-03T10:00:00.000Z",
      },
      recordingSession: {
        status: "recording",
        tripLocalId: "trip-1",
      },
      user: {
        email: "demo@example.com",
      },
    });
  });

  it("redacts bearer tokens embedded in strings", () => {
    expect(scrubSupportBundleValue("Authorization: Bearer abc.def.ghi")).toBe(
      "Authorization: Bearer [redacted]",
    );
  });
});
