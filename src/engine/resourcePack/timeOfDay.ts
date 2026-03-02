import {
  getIdByStartEndBetween,
  getResourcePack, type modifiersByKeys,
  isObject,
  type ResourcePack,
  type SegmentStartEnd, toFiniteNumber,
} from '@/engine/assets/resourcepack'

export type TimeOfDay = string;

export type ResourcePackTimeOfDaySegment = SegmentStartEnd & {
  id: TimeOfDay
  /** Optional display title (merged into i18n at resourcepack load). */
  title?: string
  multipliers?: modifiersByKeys
}

function normalizeSegment(raw: unknown): ResourcePackTimeOfDaySegment | null {
  if (!isObject(raw)) return null

  const id = String(raw.id ?? '')
  if (!id) return null
  const title = typeof (raw as any).title === 'string' ? String((raw as any).title) : undefined

  const start = toFiniteNumber(raw.start)
  const end = toFiniteNumber(raw.end)
  if (start == null || end == null) return null

  let multipliers: ResourcePackTimeOfDaySegment['multipliers'] | undefined
  if (isObject(raw.multipliers)) {
    const groups: Record<string, Record<string, number>> = {}
    for (const [groupId, groupRaw] of Object.entries(raw.multipliers)) {
      if (!isObject(groupRaw)) continue
      const stats: Record<string, number> = {}
      for (const [statKey, statRaw] of Object.entries(groupRaw)) {
        const n = toFiniteNumber(statRaw)
        if (n == null) continue
        stats[String(statKey)] = n
      }
      groups[String(groupId)] = stats
    }
    multipliers = groups
  }

  return { id, title, start, end, multipliers }
}

export function getTimeOfDaySegments(pack: ResourcePack | null = getResourcePack()): ResourcePackTimeOfDaySegment[] {
  const raw = pack?.timeOfDay?.segments
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeSegment).filter(Boolean) as ResourcePackTimeOfDaySegment[]
}

export function getTimeOfDayIdByHour(
  hour: number,
  pack: ResourcePack | null = getResourcePack()
): TimeOfDay {
  const segments = getTimeOfDaySegments(pack)
  return getIdByStartEndBetween(segments, hour) ?? segments[0]!.id!
}
