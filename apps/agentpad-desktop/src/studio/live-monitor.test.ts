import { describe, expect, it } from "vitest";

import {
  LIVE_MONITOR_INTERVAL_MS,
  freshnessFor,
  shouldPollLiveMonitor,
} from "./live-monitor";

describe("live LED monitor policy", () => {
  it("caps the refresh loop at the negotiated 20 FPS", () => {
    expect(LIVE_MONITOR_INTERVAL_MS).toBe(50);
  });

  it("only polls a visible, connected and idle Vial session", () => {
    expect(
      shouldPollLiveMonitor({
        connected: true,
        documentVisible: true,
        saving: false,
        unlockInProgress: false,
        requestInFlight: false,
      }),
    ).toBe(true);

    for (const blocked of [
      { connected: false },
      { documentVisible: false },
      { saving: true },
      { unlockInProgress: true },
      { requestInFlight: true },
    ]) {
      expect(
        shouldPollLiveMonitor({
          connected: true,
          documentVisible: true,
          saving: false,
          unlockInProgress: false,
          requestInFlight: false,
          ...blocked,
        }),
      ).toBe(false);
    }
  });

  it("marks a retained frame stale instead of fabricating a new LED state", () => {
    expect(freshnessFor(1_000, 1_250)).toBe("fresh");
    expect(freshnessFor(1_000, 1_251)).toBe("stale");
    expect(freshnessFor(undefined, 1_251)).toBe("unknown");
  });
});
