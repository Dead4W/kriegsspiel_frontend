const ASSET_PROXY_PREFIX = `${import.meta.env.VITE_API_URL}/proxy/image?url=`

function toAbsoluteHttpUrl(url: string): string | null {
  const value = String(url ?? '').trim()
  if (!value) return null

  try {
    const abs = new URL(value, window.location.href)
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return null
    return abs.toString()
  } catch {
    return null
  }
}

export function toProxyAssetUrl(url: string): string | null {
  const abs = toAbsoluteHttpUrl(url)
  if (!abs) return null
  if (abs.startsWith(ASSET_PROXY_PREFIX)) return abs
  return `${ASSET_PROXY_PREFIX}${encodeURIComponent(abs)}`
}
