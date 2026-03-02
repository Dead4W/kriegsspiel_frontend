export type ResourcePackDistanceModifierPoint = {
  distance: number
  modifier: number
}

export type ResourcePackDistanceModifiers = Record<string, ResourcePackDistanceModifierPoint[]>

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

export function normalizeDistanceModifiers(raw: unknown): ResourcePackDistanceModifiers {
  const normalized: ResourcePackDistanceModifiers = {}
  if (!isObject(raw)) return normalized

  for (const [key, val] of Object.entries(raw)) {
    if (Array.isArray(val)) normalized[key] = val as any
  }

  return normalized
}

