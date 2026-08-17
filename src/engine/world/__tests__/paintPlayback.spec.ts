import { describe, expect, it } from "vitest";
import {
  getPaintPlaybackTime,
  isHistoricalPaintStroke,
  resolvePaintTimelineStart,
} from "@/engine/world/paintPlayback";

const MIN = 60_000;

describe("paint playback timeline", () => {
  it("treats a stroke from a client that started 5 minutes earlier as past, not future", () => {
    const k1StartedAt = 1_700_000_000_000;
    const k1DrewAt = k1StartedAt + 10_000;
    const k2JoinedAt = k1StartedAt + 5 * MIN;

    expect(isHistoricalPaintStroke([k1DrewAt, k1DrewAt + 800], k2JoinedAt)).toBe(true);
    expect(isHistoricalPaintStroke([k1DrewAt, k1DrewAt + 800], k1DrewAt + 800)).toBe(false);
  });

  it("is symmetric when the second client is the one that drew first", () => {
    const k2StartedAt = 1_700_000_000_000;
    const k2DrewAt = k2StartedAt + 10_000;
    const k1JoinedAt = k2StartedAt + 5 * MIN;

    expect(isHistoricalPaintStroke([k2DrewAt, k2DrewAt + 400], k1JoinedAt)).toBe(true);
  });

  it("does not let a 5-minute-old stroke delay a live stroke in the same batch", () => {
    const nowMs = 1_700_000_000_000 + 5 * MIN;
    const oldStroke = { pointTimes: [nowMs - 5 * MIN, nowMs - 5 * MIN + 700] };
    const liveStroke = { pointTimes: [nowMs - 200, nowMs - 40] };

    const timelineStart = resolvePaintTimelineStart([oldStroke, liveStroke], nowMs);
    expect(timelineStart).toBe(liveStroke.pointTimes[0]);

    const playbackStartedAt = 12_000;
    const playbackTime = getPaintPlaybackTime(timelineStart, playbackStartedAt, playbackStartedAt);
    expect(playbackTime).toBe(liveStroke.pointTimes[0]);
    expect(playbackTime).toBeGreaterThanOrEqual(liveStroke.pointTimes[0]!);
  });

  it("uses the receive-time stopwatch, not the page-launch clock", () => {
    const strokeStart = 1_700_000_000_500;
    const lateClientPerformanceNow = 80;
    const elapsed = 250;

    expect(getPaintPlaybackTime(strokeStart, lateClientPerformanceNow, lateClientPerformanceNow + elapsed))
      .toBe(strokeStart + elapsed);
  });
});
