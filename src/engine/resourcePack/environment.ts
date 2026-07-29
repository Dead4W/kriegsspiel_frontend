import {
  getResourcePack,
  isObject,
  type ResourcePack,
  toFiniteNumber,
} from '@/engine/assets/resourcepack'

import { memoizeByPack } from '@/engine/resourcePack/memo'
import { unitType } from '@/engine/units/types'
import type { FormationType } from '@/engine/units/types'
import type { StatKey } from '@/engine/units/baseUnit'

export type EnvStatMultiplier = Partial<Record<StatKey, number>> & {
  byTypes?: Partial<Record<unitType, Partial<Record<StatKey, number>>>>
}

export type EnvironmentStateId = string

export type ResourcePackEnvironmentState = {
  id: EnvironmentStateId
  /** Optional display title (merged into i18n at resourcepack load). */
  title?: string
  icon?: string
  tags?: string[]
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
    title: typeof (raw as any).title === 'string' ? String((raw as any).title) : undefined,
    icon: typeof (raw as any).icon === 'string' ? (raw as any).icon : undefined,
    tags: Array.isArray((raw as any).tags)
      ? (raw as any).tags.map((tag: unknown) => String(tag).trim()).filter(Boolean)
      : undefined,
    isRoute: (raw as any).isRoute === true,
    params: isObject((raw as any).params) ? ((raw as any).params as Record<string, unknown>) : undefined,
    multipliers: isObject((raw as any).multipliers) ? (raw as any).multipliers : undefined,
    byTypes: isObject((raw as any).byTypes) ? (raw as any).byTypes : undefined,
  }
}

const environmentStatesByPack = memoizeByPack((pack): ResourcePackEnvironmentState[] => {
  const raw = (pack as any)?.environment?.states
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeEnvironmentState).filter(Boolean) as ResourcePackEnvironmentState[]
})

const environmentStatesByIdByPack = memoizeByPack((pack) => {
  const index = new Map<EnvironmentStateId, ResourcePackEnvironmentState>()
  // При дублях id выигрывает первый, как это делал прежний find().
  for (const state of environmentStatesByPack(pack)) {
    const id = String(state.id)
    if (!index.has(id)) index.set(id, state)
  }
  return index
})

const envMultipliersByPack = memoizeByPack((pack) => {
  const result = {} as Record<EnvironmentStateId, EnvStatMultiplier>
  for (const s of environmentStatesByPack(pack)) {
    result[String(s.id)] = {
      ...normalizeMultipliers(s.multipliers),
      byTypes: normalizeByTypes(s.byTypes),
    }
  }
  return result
})

const environmentIconsByPack = memoizeByPack((pack) => {
  const result = {} as Record<EnvironmentStateId, string>
  for (const s of environmentStatesByPack(pack)) {
    if (typeof s.icon === 'string' && s.icon) result[String(s.id)] = s.icon
  }
  return result
})

export function getEnvironmentStates(
  pack: ResourcePack | null = getResourcePack()
): ResourcePackEnvironmentState[] {
  return environmentStatesByPack(pack)
}

export function getEnvMultipliers(
  pack: ResourcePack | null = getResourcePack()
): Record<EnvironmentStateId, EnvStatMultiplier> {
  return envMultipliersByPack(pack)
}

export function getEnvironmentIcons(
  pack: ResourcePack | null = getResourcePack()
): Record<EnvironmentStateId, string> {
  return environmentIconsByPack(pack)
}

function getEnvironmentStateDef(
  state: EnvironmentStateId,
  pack: ResourcePack | null
): ResourcePackEnvironmentState | null {
  return environmentStatesByIdByPack(pack).get(String(state)) ?? null
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
  const entry = getEnvironmentStateDef(state, pack)
  return entry?.params ? toFiniteNumber(entry.params[key]) : null
}

export function getEnvironmentStringParam(
  state: EnvironmentStateId,
  key: string,
  pack: ResourcePack | null = getResourcePack()
): string | null {
  const entry = getEnvironmentStateDef(state, pack)
  const value = entry?.params?.[key]
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

export function getEnvironmentForcedFormation(
  states: EnvironmentStateId[],
  pack: ResourcePack | null = getResourcePack()
): FormationType | null {
  for (const state of states) {
    const formation = getEnvironmentStringParam(state, 'forceFormation', pack)
    if (formation) return formation
  }
  return null
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

export function getEnvironmentStateTags(
  state: EnvironmentStateId,
  pack: ResourcePack | null = getResourcePack()
): string[] {
  const entry = getEnvironmentStateDef(state, pack)
  if (!entry?.tags?.length) return []
  return entry.tags
}

export function hasEnvironmentStateTag(
  state: EnvironmentStateId,
  tag: string,
  pack: ResourcePack | null = getResourcePack()
): boolean {
  const normalizedTag = String(tag).trim()
  if (!normalizedTag) return false
  return getEnvironmentStateTags(state, pack).includes(normalizedTag)
}

