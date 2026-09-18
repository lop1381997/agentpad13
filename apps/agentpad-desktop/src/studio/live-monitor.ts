export const LIVE_MONITOR_INTERVAL_MS = 50;
const STALE_AFTER_MS = LIVE_MONITOR_INTERVAL_MS * 5;

export type LiveMonitorPollContext = {
  connected: boolean;
  documentVisible: boolean;
  saving: boolean;
  unlockInProgress: boolean;
  requestInFlight: boolean;
};

export type LiveMonitorFreshness = "fresh" | "stale" | "unknown";

export function shouldPollLiveMonitor({
  connected,
  documentVisible,
  saving,
  unlockInProgress,
  requestInFlight,
}: LiveMonitorPollContext): boolean {
  return connected && documentVisible && !saving && !unlockInProgress && !requestInFlight;
}

export function freshnessFor(
  receivedAt: number | undefined,
  now: number,
): LiveMonitorFreshness {
  if (receivedAt === undefined) {
    return "unknown";
  }
  return now - receivedAt <= STALE_AFTER_MS ? "fresh" : "stale";
}
