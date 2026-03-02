import {
  getResourcePack,
  isObject,
  type ResourcePack,
  toFiniteNumber,
} from '@/engine/assets/resourcepack'

import type { FormationType } from '@/engine/units/types'
import type { StatKey } from '@/engine/units/baseUnit'

export type FormationStatMultiplier = Partial<Record<StatKey, number>>

export type ResourcePackFormationType = {
  id: FormationType | string
  icon?: string
  multipliers?: Record<string, unknown>
}

const STAT_KEYS: StatKey[] = [
  'damage',
  'takeDamageMod',
  'speed',
  'attackRange',
  'visionRange',
]

function normalizeMultipliers(raw: unknown): FormationStatMultiplier {
  if (!isObject(raw)) return {}
  const out: FormationStatMultiplier = {}
  for (const k of STAT_KEYS) {
    const n = toFiniteNumber((raw as any)[k])
    if (n == null) continue
    out[k] = n
  }
  return out
}

function normalizeFormationType(raw: unknown): ResourcePackFormationType | null {
  if (!isObject(raw)) return null
  const id = String((raw as any).id ?? '')
  if (!id) return null
  return {
    id,
    icon: typeof (raw as any).icon === 'string' ? (raw as any).icon : undefined,
    multipliers: isObject((raw as any).multipliers) ? (raw as any).multipliers : undefined,
  }
}

export function getFormationTypes(
  pack: ResourcePack | null = getResourcePack()
): FormationType[] {
  const raw = (pack as any)?.formations?.types
  if (!Array.isArray(raw)) return []
  return raw
    .map(normalizeFormationType)
    .filter(Boolean)
    .map((t) => String((t as ResourcePackFormationType).id)) as FormationType[]
}

export function getFormationMultipliers(
  pack: ResourcePack | null = getResourcePack()
): Record<FormationType, FormationStatMultiplier> {
  const raw = (pack as any)?.formations?.types
  if (!Array.isArray(raw)) return {} as Record<FormationType, FormationStatMultiplier>

  const result = {} as Record<FormationType, FormationStatMultiplier>
  for (const t of raw.map(normalizeFormationType).filter(Boolean) as ResourcePackFormationType[]) {
    result[String(t.id) as FormationType] = normalizeMultipliers(t.multipliers)
  }
  return result
}

export function getFormationIcons(
  pack: ResourcePack | null = getResourcePack()
): Record<FormationType, string> {
  const raw = (pack as any)?.formations?.types
  if (!Array.isArray(raw)) return {} as Record<FormationType, string>

  const result = {} as Record<FormationType, string>
  for (const t of raw.map(normalizeFormationType).filter(Boolean) as ResourcePackFormationType[]) {
    if (typeof t.icon === 'string' && t.icon) {
      result[String(t.id) as FormationType] = t.icon
    }
  }
  return result
}

export function getFormationIcon(
  formation: FormationType,
  pack: ResourcePack | null = getResourcePack()
): string {
  return getFormationIcons(pack)?.[formation] ?? ''
}

