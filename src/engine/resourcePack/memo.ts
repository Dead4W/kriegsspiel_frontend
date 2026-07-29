import type { ResourcePack } from '@/engine/assets/resourcepack'

// Пак никогда не мутируется после загрузки: loadResourcePack() всегда кладёт
// в window.RESOURCEPACK новый объект из normalizePack(). Поэтому сам объект пака
// можно использовать как ключ кэша, а старые записи соберёт GC.
const NULL_PACK_KEY: object = {}

export function memoizeByPack<T>(
  compute: (pack: ResourcePack | null) => T
): (pack: ResourcePack | null) => T {
  const cache = new WeakMap<object, T>()

  return (pack: ResourcePack | null): T => {
    const key = (pack as unknown as object | null) ?? NULL_PACK_KEY
    const cached = cache.get(key)
    if (cached !== undefined) return cached

    const value = compute(pack)
    cache.set(key, value)
    return value
  }
}
