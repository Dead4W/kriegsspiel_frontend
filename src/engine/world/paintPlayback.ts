export const PAINT_ANIMATION_MAX_AGE_MS = 2_000

export function isHistoricalPaintStroke(
  pointTimes: number[] | undefined,
  nowMs: number,
  maxAgeMs = PAINT_ANIMATION_MAX_AGE_MS,
) {
  const lastPointTime = pointTimes?.[pointTimes.length - 1]
  return lastPointTime !== undefined && nowMs - lastPointTime > maxAgeMs
}

export function resolvePaintTimelineStart(
  strokes: Array<{ pointTimes?: number[] }>,
  nowMs: number,
) {
  let timelineStart = Number.POSITIVE_INFINITY
  for (const stroke of strokes) {
    if (isHistoricalPaintStroke(stroke.pointTimes, nowMs)) continue
    const firstPointTime = stroke.pointTimes?.[0]
    if (firstPointTime !== undefined && Number.isFinite(firstPointTime)) {
      timelineStart = Math.min(timelineStart, firstPointTime)
    }
  }
  return timelineStart
}

export function getPaintPlaybackTime(
  timelineStart: number,
  playbackStartedAt: number,
  now: number,
) {
  return timelineStart + (now - playbackStartedAt)
}
