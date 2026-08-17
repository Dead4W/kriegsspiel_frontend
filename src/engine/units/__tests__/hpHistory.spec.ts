import { describe, expect, it } from "vitest";
import {
  HP_HISTORY_WINDOW_SECONDS,
  HP_LOSS_WINDOW_SECONDS,
  formatHpLostShort,
  readReportedHpLost5min,
  anchorUnitHpHistory,
  hpLostOverSeconds,
  interpolateHpAt,
  pruneHpHistory,
  recordUnitHpHistory,
  upsertHpSample,
  worldTimeToMs,
} from "@/engine/units/hpHistory";

const MIN = 60_000;

function sample(minutes: number, hp: number) {
  return { t: minutes * MIN, hp };
}

describe("hp history", () => {
  it("parses world time the same way the board clock does", () => {
    expect(worldTimeToMs("1882-06-12 09:00:00")).toBe(
      new Date("1882-06-12T09:00:00").getTime(),
    );
  });

  it("keeps the start of an idle plateau and only slides the trailing point", () => {
    const history = [sample(0, 100)];
    upsertHpSample(history, 60 * MIN, 100);
    upsertHpSample(history, 70 * MIN, 100);
    expect(history).toEqual([sample(0, 100), sample(70, 100)]);
  });

  it("keeps both ends of a large tick so loss can be read linearly", () => {
    const history = [sample(0, 100)];
    upsertHpSample(history, 10 * MIN, 40);
    expect(history).toEqual([sample(0, 100), sample(10, 40)]);
    expect(interpolateHpAt(history, 5 * MIN, 40, 10 * MIN)).toBe(70);
    expect(hpLostOverSeconds(history, 40, 10 * MIN, HP_LOSS_WINDOW_SECONDS)).toBe(30);
  });

  it("drops a hit from the 5-minute label once idle time leaves the window", () => {
    const unit = { hp: 100, hpHistory: [sample(9, 100)] };
    anchorUnitHpHistory(unit, 10 * MIN);
    unit.hp = 99.7;
    recordUnitHpHistory(unit, 11 * MIN);
    expect(hpLostOverSeconds(unit.hpHistory, unit.hp, 11 * MIN, HP_LOSS_WINDOW_SECONDS))
      .toBeCloseTo(0.3, 5);

    anchorUnitHpHistory(unit, 16 * MIN);
    recordUnitHpHistory(unit, 16 * MIN);
    expect(hpLostOverSeconds(unit.hpHistory, unit.hp, 16 * MIN, HP_LOSS_WINDOW_SECONDS)).toBe(0);

    anchorUnitHpHistory(unit, 31 * MIN);
    recordUnitHpHistory(unit, 31 * MIN);
    expect(hpLostOverSeconds(unit.hpHistory, unit.hp, 31 * MIN, HP_LOSS_WINDOW_SECONDS)).toBe(0);
  });

  it("does not smear combat across a long pause before a large tick", () => {
    const unit = { hp: 100, hpHistory: [sample(0, 100)] };
    anchorUnitHpHistory(unit, 60 * MIN);
    unit.hp = 40;
    recordUnitHpHistory(unit, 70 * MIN);
    expect(hpLostOverSeconds(unit.hpHistory, unit.hp, 70 * MIN, HP_LOSS_WINDOW_SECONDS)).toBe(30);
  });

  it("drops samples older than 10 minutes but keeps one point before the window", () => {
    const history = [0, 2, 4, 6, 8, 10, 12, 14, 16].map((minute) => sample(minute, 100 - minute));
    pruneHpHistory(history, 16 * MIN, HP_HISTORY_WINDOW_SECONDS);
    expect(history[0]).toEqual(sample(4, 96));
    expect(history[history.length - 1]).toEqual(sample(16, 84));
  });

  it("reads a reported 5-minute loss from direct_view", () => {
    expect(readReportedHpLost5min(0.5)).toBe(0.5);
    expect(readReportedHpLost5min(-3)).toBe(0);
    expect(readReportedHpLost5min(undefined)).toBe(0);
  });

  it("formats map damage as -0.5/5m", () => {
    expect(formatHpLostShort(0.5)).toBe("-0.5/5m");
    expect(formatHpLostShort(12.4)).toBe("-12/5m");
    expect(formatHpLostShort(0)).toBeNull();
  });

  it("reports no loss when HP only went up", () => {
    const history = [sample(0, 40)];
    upsertHpSample(history, 5 * MIN, 80);
    expect(hpLostOverSeconds(history, 80, 5 * MIN, HP_LOSS_WINDOW_SECONDS)).toBe(0);
  });
});
