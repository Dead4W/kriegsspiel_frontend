import type {ResourcePackTimeOfDaySegment} from "@/engine/resourcePack/timeOfDay.ts";
import type {TimeStatMultiplier} from "@/engine/units/modifiers/UnitTimeModifiers.ts";
import type { ResourcePackWeatherCondition } from "@/engine/resourcePack/weather.ts";
import type { AbilityStatMultiplier, UnitAbilityType } from "@/engine/units/modifiers/UnitAbilityModifiers.ts";
import type { UnitStats } from "@/engine/units/baseUnit.ts";
import type { FormationType, unitType } from "@/engine/units/types.ts";
import {
  normalizeDistanceModifiers,
  type ResourcePackDistanceModifiers,
} from "@/engine/resourcePack/distanceModifiers.ts";


export type SegmentStartEnd = {
  start: number
  end: number
}

export type modifiersByKeys = Record<string, TimeStatMultiplier>

export type ResourcePackAngleModifier = {
  angle: number
  modifier: number
}

export type ResourcePackAbilityType = {
  id: UnitAbilityType | string
  multipliers?: AbilityStatMultiplier
  params?: Record<string, unknown>
}

export type ResourcePackUnitType = {
  id: unitType | string
  stats: UnitStats
  abilities?: UnitAbilityType[]
  defaultFormation?: FormationType
  params?: Record<string, unknown>
}

export type ResourcePackEnvironmentState = {
  id: string
  icon?: string
  isRoute?: boolean
  params?: Record<string, unknown>
  multipliers?: Record<string, unknown>
  byTypes?: Record<string, Record<string, unknown>>
}

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
  abilities?: {
    types: ResourcePackAbilityType[]
  }
  units?: {
    types: ResourcePackUnitType[]
  }
  environment?: {
    states: ResourcePackEnvironmentState[]
  }
  angleModifiers?: ResourcePackAngleModifier[]
  distanceModifiers?: ResourcePackDistanceModifiers
}

let cached: ResourcePack | null = null
let inFlight: Promise<ResourcePack | null> | null = null

function normalizeAngleModifiers(raw: unknown): ResourcePackAngleModifier[] {
  if (!Array.isArray(raw)) return []
  const result: ResourcePackAngleModifier[] = []
  for (const item of raw) {
    if (!isObject(item)) continue
    const angle = toFiniteNumber(item.angle)
    const modifier = toFiniteNumber(item.modifier)
    if (angle == null || modifier == null) continue
    result.push({ angle, modifier })
  }
  return result
}

function normalizePack(raw: unknown): ResourcePack {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as any
  const segments = r?.timeOfDay?.segments
  const conditions = r?.weather?.conditions
  const abilityTypes = r?.abilities?.types
  const unitTypes = r?.units?.types
  const envStates = r?.environment?.states
  const angleModifiers = r?.angleModifiers
  const distanceModifiers = r?.distanceModifiers

  const normalizedDistanceModifiers = normalizeDistanceModifiers(distanceModifiers)
  const normalizedAngleModifiers = normalizeAngleModifiers(angleModifiers)

  return {
    timeOfDay: {
      segments: Array.isArray(segments) ? (segments as ResourcePackTimeOfDaySegment[]) : [],
    },
    weather: {
      conditions: Array.isArray(conditions) ? (conditions as ResourcePackWeatherCondition[]) : [],
    },
    abilities: {
      types: Array.isArray(abilityTypes)
        ? (abilityTypes.filter(isObject) as unknown as ResourcePackAbilityType[])
        : [],
    },
    units: {
      types: Array.isArray(unitTypes)
        ? (unitTypes.filter(isObject) as unknown as ResourcePackUnitType[])
        : [],
    },
    environment: {
      states: Array.isArray(envStates)
        ? (envStates.filter(isObject) as unknown as ResourcePackEnvironmentState[])
        : [],
    },
    angleModifiers: normalizedAngleModifiers,
    distanceModifiers: normalizedDistanceModifiers,
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

