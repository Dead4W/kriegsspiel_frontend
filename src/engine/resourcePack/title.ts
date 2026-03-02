import i18n from '@/i18n'
import type { ResourcePack } from '@/engine/assets/resourcepack'

type TitleCategory = 'unit' | 'ability' | 'formation' | 'weather' | 'env' | 'time'

function locales(): string[] {
  const msgs = (i18n.global as any)?.messages?.value
  if (msgs && typeof msgs === 'object') return Object.keys(msgs)
  return [String((i18n.global as any)?.locale?.value ?? 'en')]
}

function collectTitles(pack: ResourcePack): Record<TitleCategory, Record<string, string>> {
  const unit: Record<string, string> = {}
  const ability: Record<string, string> = {}
  const formation: Record<string, string> = {}
  const weather: Record<string, string> = {}
  const env: Record<string, string> = {}
  const time: Record<string, string> = {}

  for (const t of pack?.units?.types ?? []) {
    if (t?.id && typeof (t as any).title === 'string' && (t as any).title) {
      unit[String(t.id)] = String((t as any).title)
    }
  }

  for (const t of pack?.abilities?.types ?? []) {
    if (t?.id && typeof (t as any).title === 'string' && (t as any).title) {
      ability[String(t.id)] = String((t as any).title)
    }
  }

  for (const t of pack?.formations?.types ?? []) {
    if (t?.id && typeof (t as any).title === 'string' && (t as any).title) {
      formation[String(t.id)] = String((t as any).title)
    }
  }

  for (const t of pack?.weather?.conditions ?? []) {
    if (t?.id && typeof (t as any).title === 'string' && (t as any).title) {
      weather[String(t.id)] = String((t as any).title)
    }
  }

  for (const t of (pack as any)?.environment?.states ?? []) {
    if (t?.id && typeof (t as any).title === 'string' && (t as any).title) {
      env[String(t.id)] = String((t as any).title)
    }
  }

  for (const t of pack?.timeOfDay?.segments ?? []) {
    if (t?.id && typeof (t as any).title === 'string' && (t as any).title) {
      time[String(t.id)] = String((t as any).title)
    }
  }

  return { unit, ability, formation, weather, env, time }
}

/**
 * If resourcepack defines titles (e.g. `units.types[].title`),
 * inject them into i18n keys used throughout UI (`unit.<id>`, `ability.<id>`, ...).
 *
 * - Does not override existing translations.
 * - Applies to all registered locales.
 */
export function applyResourcePackTitles(pack: ResourcePack | null): void {
  if (!pack) return

  const titles = collectTitles(pack)
  const cats = Object.entries(titles) as Array<[TitleCategory, Record<string, string>]>

  for (const locale of locales()) {
    const patch: Partial<Record<TitleCategory, Record<string, string>>> = {}

    for (const [cat, map] of cats) {
      for (const [id, title] of Object.entries(map)) {
        const key = `${cat}.${id}`
        if ((i18n.global as any).te?.(key, locale)) continue
        ;(patch[cat] ??= {})[id] = title
      }
    }

    if (Object.keys(patch).length) {
      ;(i18n.global as any).mergeLocaleMessage?.(locale, patch)
    }
  }
}

