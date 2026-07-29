import {
  getResourcePack,
  isObject,
  type ResourcePack,
  toFiniteNumber,
} from '@/engine/assets/resourcepack'

import { memoizeByPack } from '@/engine/resourcePack/memo'
import type { FormationType } from '@/engine/units/types'
import type { StatKey } from '@/engine/units/baseUnit'

export type FormationStatMultiplier = Partial<Record<StatKey | 'fatigue', number>>

export type ResourcePackFormationType = {
  id: FormationType | string
  /** Optional display title (merged into i18n at resourcepack load). */
  title?: string
  icon?: string
  tags?: string[]
  multipliers?: Record<string, unknown>
}

const STAT_KEYS: StatKey[] = [
  'damage',
  'takeDamageMod',
  'speed',
  'attackRange',
  'visionRange',
]
const FATIGUE_MULTIPLIER_KEY = 'fatigue'

function normalizeMultipliers(raw: unknown): FormationStatMultiplier {
  if (!isObject(raw)) return {}
  const out: FormationStatMultiplier = {}
  for (const k of STAT_KEYS) {
    const n = toFiniteNumber((raw as any)[k])
    if (n == null) continue
    out[k] = n
  }
  const fatigue = toFiniteNumber((raw as any)[FATIGUE_MULTIPLIER_KEY])
  if (fatigue != null) out.fatigue = fatigue
  return out
}

function normalizeFormationType(raw: unknown): ResourcePackFormationType | null {
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
    multipliers: isObject((raw as any).multipliers) ? (raw as any).multipliers : undefined,
  }
}

const formationTypesByPack = memoizeByPack((pack): ResourcePackFormationType[] => {
  const raw = (pack as any)?.formations?.types
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeFormationType).filter(Boolean) as ResourcePackFormationType[]
})

const formationIdsByPack = memoizeByPack(
  (pack): FormationType[] =>
    formationTypesByPack(pack).map((t) => String(t.id)) as FormationType[]
)

const formationMultipliersByPack = memoizeByPack((pack) => {
  const result = {} as Record<FormationType, FormationStatMultiplier>
  for (const t of formationTypesByPack(pack)) {
    result[String(t.id) as FormationType] = normalizeMultipliers(t.multipliers)
  }
  return result
})

const formationIconsByPack = memoizeByPack((pack) => {
  const result = {} as Record<FormationType, string>
  for (const t of formationTypesByPack(pack)) {
    if (typeof t.icon === 'string' && t.icon) {
      result[String(t.id) as FormationType] = t.icon
    }
  }
  return result
})

export function getFormationTypes(
  pack: ResourcePack | null = getResourcePack()
): FormationType[] {
  return formationIdsByPack(pack)
}

export function getFormationMultipliers(
  pack: ResourcePack | null = getResourcePack()
): Record<FormationType, FormationStatMultiplier> {
  return formationMultipliersByPack(pack)
}

export function getFormationIcons(
  pack: ResourcePack | null = getResourcePack()
): Record<FormationType, string> {
  return formationIconsByPack(pack)
}

export function getFormationIcon(
  formation: FormationType,
  pack: ResourcePack | null = getResourcePack()
): string {
  return getFormationIcons(pack)?.[formation] ?? ''
}

export function getFormationTags(
  formation: FormationType,
  pack: ResourcePack | null = getResourcePack()
): string[] {
  return getFormationTypesRaw(pack)
    .find((type) => String(type.id) === formation)
    ?.tags ?? []
}

export function hasFormationTag(
  formation: FormationType,
  tag: string,
  pack: ResourcePack | null = getResourcePack()
): boolean {
  const normalizedTag = String(tag).trim()
  return !!normalizedTag && getFormationTags(formation, pack).includes(normalizedTag)
}

function getFormationTypesRaw(
  pack: ResourcePack | null
): ResourcePackFormationType[] {
  return formationTypesByPack(pack)
}

