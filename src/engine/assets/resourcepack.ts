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
import { applyResourcePackTitles } from "@/engine/resourcePack/title.ts";
import { toProxyAssetUrl } from "@/engine/assets/proxy.ts";


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
  /** Optional display title (merged into i18n at load). */
  title?: string
  multipliers?: AbilityStatMultiplier
  params?: Record<string, unknown>
}

export type ResourcePackFormationType = {
  id: string
  /** Optional display title (merged into i18n at load). */
  title?: string
  multipliers?: Record<string, unknown>
}

export type ResourcePackUnitType = {
  id: unitType | string
  /** Optional display title (merged into i18n at load). */
  title?: string
  stats: UnitStats
  abilities?: UnitAbilityType[]
  defaultFormation?: FormationType
  params?: Record<string, unknown>
}

export type ResourcePackEnvironmentState = {
  id: string
  /** Optional display title (merged into i18n at load). */
  title?: string
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
  inaccuracy?: {
    heightFactor?: number
    distanceFactor?: number
  }
  moraleCheck?: {
    dice?: {
      count?: number
      sides?: number
    }
    commander?: {
      radiusMeters?: number
      penalty?: number
    }
    lossPenalties?: Array<{
      lossesMoreThan?: number
      penalty?: number
      key?: string
    }>
    outcomes?: Array<{
      minTotal?: number
      id?: string
    }>
    effects?: {
      retreatDurationSeconds?: number
      fleeDurationMultiplier?: number
      fleeHpMultiplier?: number
    }
  }
  abilities?: {
    types: ResourcePackAbilityType[]
  }
  formations?: {
    types: ResourcePackFormationType[]
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
let loadedFromUrlAbs: string | null = null
const titlesApplied = new WeakSet<object>()

function applyTitlesOnce(pack: ResourcePack | null) {
  if (!pack || typeof pack !== 'object') return
  if (titlesApplied.has(pack as unknown as object)) return
  applyResourcePackTitles(pack)
  titlesApplied.add(pack as unknown as object)
}

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
  const inaccuracy = r?.inaccuracy
  const moraleCheck = r?.moraleCheck
  const abilityTypes = r?.abilities?.types
  const formationTypes = r?.formations?.types
  const unitTypes = r?.units?.types
  const envStates = r?.environment?.states
  const angleModifiers = r?.angleModifiers
  const distanceModifiers = r?.distanceModifiers

  const normalizedDistanceModifiers = normalizeDistanceModifiers(distanceModifiers)
  const normalizedAngleModifiers = normalizeAngleModifiers(angleModifiers)
  const normalizedInaccuracy = isObject(inaccuracy)
    ? {
      heightFactor: toFiniteNumber((inaccuracy as any).heightFactor) ?? 5.0,
      distanceFactor: toFiniteNumber((inaccuracy as any).distanceFactor) ?? 0.1,
    }
    : { heightFactor: 5.0, distanceFactor: 0.1 }

  return {
    timeOfDay: {
      segments: Array.isArray(segments) ? (segments as ResourcePackTimeOfDaySegment[]) : [],
    },
    weather: {
      conditions: Array.isArray(conditions) ? (conditions as ResourcePackWeatherCondition[]) : [],
    },
    inaccuracy: normalizedInaccuracy,
    moraleCheck: isObject(moraleCheck) ? (moraleCheck as any) : undefined,
    abilities: {
      types: Array.isArray(abilityTypes)
        ? (abilityTypes.filter(isObject) as unknown as ResourcePackAbilityType[])
        : [],
    },
    formations: {
      types: Array.isArray(formationTypes)
        ? (formationTypes.filter(isObject) as unknown as ResourcePackFormationType[])
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
  const pack = window.RESOURCEPACK ?? cached
  applyTitlesOnce(pack)
  return pack
}

export function getLoadedResourcePackUrl(): string | null {
  return loadedFromUrlAbs
}

function isProbablyAbsoluteUrl(url: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url)
}

/**
 * Resolves a URL/relative-path against the last loaded resourcepack URL.
 * - Keeps absolute URLs (https:, data:, blob:, etc.) untouched
 * - Keeps absolute site paths ("/...") untouched
 * - Resolves relative paths ("units/infantry.png") relative to the resourcepack JSON URL
 */
export function resolveResourcePackUrl(urlOrPath: string): string {
  const v = String(urlOrPath ?? '').trim()
  if (!v) return ''
  if (isProbablyAbsoluteUrl(v)) return v
  if (v.startsWith('/')) return v
  if (!loadedFromUrlAbs) return v
  try {
    return new URL(v, loadedFromUrlAbs).toString()
  } catch {
    return v
  }
}

async function fetchResourcePackJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`resourcepack_load_failed:${res.status}`)
  return await res.json()
}

async function fetchResourcePackJsonWithFallback(url: string): Promise<unknown> {
  try {
    return await fetchResourcePackJson(url)
  } catch {
    const proxyUrl = toProxyAssetUrl(url)
    if (!proxyUrl) throw new Error('resourcepack_load_failed')
    return await fetchResourcePackJson(proxyUrl)
  }
}

export async function loadResourcePack(url: string): Promise<ResourcePack | null> {
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      loadedFromUrlAbs = new URL(url, window.location.href).toString()
      const json = await fetchResourcePackJsonWithFallback(url)
      cached = normalizePack(json)
      window.RESOURCEPACK = cached
      applyTitlesOnce(cached)
      return cached
    } catch {
      cached = null
      loadedFromUrlAbs = null
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

