import {
  getResourcePack,
  isObject,
  type ResourcePack,
  toFiniteNumber,
} from '@/engine/assets/resourcepack'

import type { UnitStats } from '@/engine/units/baseUnit'
import { FormationType, unitType } from '@/engine/units/types'
import type { UnitAbilityType } from '@/engine/units/modifiers/UnitAbilityModifiers'

export type UnitTypeId = string

export type ResourcePackUnitType = {
  id: UnitTypeId
  stats: UnitStats
  abilities: UnitAbilityType[]
  defaultFormation?: FormationType
  params?: Record<string, unknown>
}

const STAT_KEYS: Array<keyof UnitStats> = [
  'maxHp',
  'damage',
  'speed',
  'takeDamageMod',
  'attackRange',
  'visionRange',
  'ammoMax',
]

function normalizeStats(raw: unknown): UnitStats | null {
  if (!isObject(raw)) return null
  const out = {} as Record<string, number>
  for (const k of STAT_KEYS) {
    const n = toFiniteNumber((raw as any)[k])
    if (n == null) return null
    out[k] = n
  }
  return out as unknown as UnitStats
}

function normalizeAbilities(raw: unknown): UnitAbilityType[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => String(x)).filter(Boolean) as UnitAbilityType[]
}

function normalizeDefaultFormation(raw: unknown): FormationType | undefined {
  const v = String(raw ?? '')
  if (!v) return undefined
  const allowed = new Set<string>(Object.values(FormationType))
  return allowed.has(v) ? (v as FormationType) : undefined
}

function normalizeUnitType(raw: unknown): ResourcePackUnitType | null {
  if (!isObject(raw)) return null
  const id = String((raw as any).id ?? '')
  if (!id) return null

  const stats = normalizeStats((raw as any).stats)
  if (!stats) return null

  const abilities = normalizeAbilities((raw as any).abilities)
  const defaultFormation = normalizeDefaultFormation((raw as any).defaultFormation)
  const params = isObject((raw as any).params) ? ((raw as any).params as Record<string, unknown>) : undefined

  return {
    id,
    stats,
    abilities,
    defaultFormation,
    params,
  }
}

export function getUnitTypes(
  pack: ResourcePack | null = getResourcePack()
): ResourcePackUnitType[] {
  const raw = pack?.units?.types
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeUnitType).filter(Boolean) as ResourcePackUnitType[]
}

export function getUnitTypeDef(
  id: UnitTypeId,
  pack: ResourcePack | null = getResourcePack()
): ResourcePackUnitType | null {
  const types = getUnitTypes(pack)
  return types.find((t) => t.id === id) ?? null
}

export function getUnitParams(
  id: UnitTypeId,
  pack: ResourcePack | null = getResourcePack()
): Record<string, unknown> {
  return getUnitTypeDef(id, pack)?.params ?? {}
}

export function getUnitBoolParam(
  id: UnitTypeId,
  key: string,
  pack: ResourcePack | null = getResourcePack()
): boolean {
  const v = getUnitParams(id, pack)[key]
  return v === true
}

export function getUnitNumberParam(
  id: UnitTypeId,
  key: string,
  pack: ResourcePack | null = getResourcePack()
): number | null {
  const v = getUnitParams(id, pack)[key]
  return toFiniteNumber(v)
}

export function getUnitStringArrayParam(
  id: UnitTypeId,
  key: string,
  pack: ResourcePack | null = getResourcePack()
): string[] {
  const v = getUnitParams(id, pack)[key]
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x)).filter(Boolean)
}

function isKnownUnitType(id: string): id is unitType {
  return (Object.values(unitType) as string[]).includes(id)
}

/**
 * Unit types available for spawn UI.
 * - Prefers the order from resourcepack `units.types`.
 * - Always includes `general` and `messenger` as safe defaults.
 */
export function getSpawnUnitTypes(
  pack: ResourcePack | null = getResourcePack()
): unitType[] {
  const fromPack = getUnitTypes(pack)
    .map((t) => t.id)
    .filter(isKnownUnitType)

  const set = new Set<unitType>(fromPack)
  set.add(unitType.GENERAL)
  set.add(unitType.MESSENGER)

  const result: unitType[] = []
  for (const t of fromPack) {
    if (t === unitType.MESSENGER) continue
    if (!result.includes(t)) result.push(t)
  }
  // append defaults if missing from pack
  if (!result.includes(unitType.GENERAL)) result.push(unitType.GENERAL)
  return result
}

