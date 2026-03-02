import {
  getResourcePack,
  isObject,
  type ResourcePack,
  toFiniteNumber,
} from '@/engine/assets/resourcepack'

import { unitType } from '@/engine/units/types'
import type { StatKey } from '@/engine/units/baseUnit'

export type EnvStatMultiplier = Partial<Record<StatKey, number>> & {
  byTypes?: Partial<Record<unitType, Partial<Record<StatKey, number>>>>
}

export type EnvironmentStateId = string

export type ResourcePackEnvironmentState = {
  id: EnvironmentStateId
  icon?: string
  isRoute?: boolean
  params?: Record<string, unknown>
  multipliers?: Partial<Record<string, unknown>>
  byTypes?: Partial<Record<string, Partial<Record<string, unknown>>>>
}

const STAT_KEYS: StatKey[] = [
  'damage',
  'takeDamageMod',
  'speed',
  'attackRange',
  'visionRange',
]

function normalizeMultipliers(raw: unknown): Partial<Record<StatKey, number>> {
  if (!isObject(raw)) return {}
  const out: Partial<Record<StatKey, number>> = {}
  for (const k of STAT_KEYS) {
    const n = toFiniteNumber((raw as any)[k])
    if (n == null) continue
    out[k] = n
  }
  return out
}

function normalizeByTypes(
  raw: unknown
): Partial<Record<unitType, Partial<Record<StatKey, number>>>> | undefined {
  if (!isObject(raw)) return undefined
  const allowedUnitTypes = new Set<string>(Object.values(unitType))
  const out: Partial<Record<unitType, Partial<Record<StatKey, number>>>> = {}

  for (const [unitTypeId, multipliersRaw] of Object.entries(raw)) {
    const key = String(unitTypeId)
    if (!allowedUnitTypes.has(key)) continue
    out[key as unitType] = normalizeMultipliers(multipliersRaw)
  }
  return out
}

function normalizeEnvironmentState(raw: unknown): ResourcePackEnvironmentState | null {
  if (!isObject(raw)) return null
  const id = String((raw as any).id ?? '')
  if (!id) return null
  return {
    id,
    icon: typeof (raw as any).icon === 'string' ? (raw as any).icon : undefined,
    isRoute: (raw as any).isRoute === true,
    params: isObject((raw as any).params) ? ((raw as any).params as Record<string, unknown>) : undefined,
    multipliers: isObject((raw as any).multipliers) ? (raw as any).multipliers : undefined,
    byTypes: isObject((raw as any).byTypes) ? (raw as any).byTypes : undefined,
  }
}

export function getEnvironmentStates(
  pack: ResourcePack | null = getResourcePack()
): ResourcePackEnvironmentState[] {
  const raw = (pack as any)?.environment?.states
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeEnvironmentState).filter(Boolean) as ResourcePackEnvironmentState[]
}

export function getEnvMultipliers(
  pack: ResourcePack | null = getResourcePack()
): Record<EnvironmentStateId, EnvStatMultiplier> {
  const states = getEnvironmentStates(pack)
  const result = {} as Record<EnvironmentStateId, EnvStatMultiplier>
  for (const s of states) {
    const id = String(s.id)
    result[id] = {
      ...normalizeMultipliers(s.multipliers),
      byTypes: normalizeByTypes(s.byTypes),
    }
  }
  return result
}

export function getEnvironmentIcons(
  pack: ResourcePack | null = getResourcePack()
): Record<EnvironmentStateId, string> {
  const states = getEnvironmentStates(pack)
  const result = {} as Record<EnvironmentStateId, string>
  for (const s of states) {
    const id = String(s.id)
    if (typeof s.icon === 'string' && s.icon) result[id] = s.icon
  }
  return result
}

export function getEnvironmentIcon(
  state: EnvironmentStateId,
  pack: ResourcePack | null = getResourcePack()
): string {
  return getEnvironmentIcons(pack)?.[state] ?? ''
}

export function getRouteEnvironmentStates(
  pack: ResourcePack | null = getResourcePack()
): EnvironmentStateId[] {
  return getEnvironmentStates(pack)
    .filter((s) => s.isRoute)
    .map((s) => String(s.id))
}

export function getEnvironmentNumberParam(
  state: EnvironmentStateId,
  key: string,
  pack: ResourcePack | null = getResourcePack()
): number | null {
  const states = getEnvironmentStates(pack)
  const entry = states.find((s) => String(s.id) === state)
  return entry?.params ? toFiniteNumber(entry.params[key]) : null
}

export function getEnvironmentMoraleCheckMod(
  states: EnvironmentStateId[],
  pack: ResourcePack | null = getResourcePack()
): number {
  let best = 0
  for (const s of states) {
    const n = getEnvironmentNumberParam(s, 'moraleCheckMod', pack)
    if (n == null) continue
    if (Math.abs(n) > Math.abs(best)) best = n
  }
  return best
}

