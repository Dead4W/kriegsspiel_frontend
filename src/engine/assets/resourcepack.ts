import type {ResourcePackTimeOfDaySegment} from "@/engine/resourcePack/timeOfDay.ts";
import type {TimeStatMultiplier} from "@/engine/units/modifiers/UnitTimeModifiers.ts";
import type { ResourcePackWeatherCondition } from "@/engine/resourcePack/weather.ts";


export type SegmentStartEnd = {
  start: number
  end: number
}

export type modifiersByKeys = Record<string, TimeStatMultiplier>

export function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

export function toFiniteNumber(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function getIdByStartEndBetween<T extends SegmentStartEnd & { id: string }>(
  segments: T[],
  value: number
): string | undefined {
  const v = Number(value)
  if (!Number.isFinite(v)) return undefined

  for (const seg of segments) {
    const start = Number(seg.start)
    const end = Number(seg.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue

    // start === end => "always in range" (full loop)
    if (start === end) return seg.id

    // normal range: [start, end)
    if (start < end) {
      if (v >= start && v < end) return seg.id
      continue
    }

    // wrap-around range: [start, +inf) U (-inf, end)
    if (v >= start || v < end) return seg.id
  }

  return undefined
}

export type ResourcePack = {
  timeOfDay?: {
    segments: ResourcePackTimeOfDaySegment[]
  }
  weather?: {
    conditions: ResourcePackWeatherCondition[]
  }
}

let cached: ResourcePack | null = null
let inFlight: Promise<ResourcePack | null> | null = null

function normalizePack(raw: unknown): ResourcePack {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as any
  const segments = r?.timeOfDay?.segments
  const conditions = r?.weather?.conditions
  return {
    timeOfDay: {
      segments: Array.isArray(segments) ? (segments as ResourcePackTimeOfDaySegment[]) : [],
    },
    weather: {
      conditions: Array.isArray(conditions) ? (conditions as ResourcePackWeatherCondition[]) : [],
    },
  }
}

export function getResourcePack(): ResourcePack | null {
  return window.RESOURCEPACK ?? cached
}

export async function loadResourcePack(url: string): Promise<ResourcePack | null> {
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`resourcepack_load_failed:${res.status}`)
      const json = await res.json()
      cached = normalizePack(json)
      window.RESOURCEPACK = cached
      return cached
    } catch {
      cached = null
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

