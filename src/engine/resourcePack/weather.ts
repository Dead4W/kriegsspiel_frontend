import {
  getResourcePack,
  isObject,
  type ResourcePack,
  toFiniteNumber,
} from '@/engine/assets/resourcepack'

import type { WeatherStatMultiplier } from '@/engine/units/modifiers/UnitWeatherModifiers'

export type Weather = string

export type ResourcePackWeatherEffect =
  | {
      type: 'fog'
      mult?: number
    }
  | {
      type: 'clouds'
    }

export type ResourcePackWeatherCondition = {
  id: Weather
  multipliers?: WeatherStatMultiplier
  effect?: ResourcePackWeatherEffect
}

function normalizeEffect(raw: unknown): ResourcePackWeatherEffect | null {
  if (!isObject(raw)) return null
  const type = String(raw.type ?? '')
  if (!type) return null

  if (type === 'fog') {
    const mult = toFiniteNumber(raw.mult)
    return { type: 'fog', mult: mult == null ? undefined : mult }
  }

  if (type === 'clouds') {
    return { type: 'clouds' }
  }

  return null
}

function normalizeCondition(raw: unknown): ResourcePackWeatherCondition | null {
  if (!isObject(raw)) return null

  const id = String(raw.id ?? '')
  if (!id) return null

  let multipliers: ResourcePackWeatherCondition['multipliers'] | undefined
  if (isObject(raw.multipliers)) {
    const stats: Record<string, number> = {}
    for (const [statKey, statRaw] of Object.entries(raw.multipliers)) {
      const n = toFiniteNumber(statRaw)
      if (n == null) continue
      stats[String(statKey)] = n
    }
    multipliers = stats as WeatherStatMultiplier
  }

  const effect = normalizeEffect(raw.effect) ?? undefined

  return { id, multipliers, effect }
}

export function getWeatherConditions(
  pack: ResourcePack | null = getResourcePack()
): ResourcePackWeatherCondition[] {
  const raw = pack?.weather?.conditions
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeCondition).filter(Boolean) as ResourcePackWeatherCondition[]
}

export function getWeatherMultipliers(
  pack: ResourcePack | null = getResourcePack()
): Record<Weather, WeatherStatMultiplier> {
  const conditions = getWeatherConditions(pack)
  const result: Record<Weather, WeatherStatMultiplier> = {}
  for (const c of conditions) result[c.id] = c.multipliers ?? {}
  return result
}

export function getWeatherEffect(
  weatherId: Weather,
  pack: ResourcePack | null = getResourcePack()
): ResourcePackWeatherEffect | null {
  const conditions = getWeatherConditions(pack)
  return conditions.find((c) => c.id === weatherId)?.effect ?? null
}

