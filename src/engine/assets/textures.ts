import {unitType} from "@/engine";
import {getSpawnUnitTypes, getUnitStringParam} from "@/engine/resourcePack/units.ts";
import { resolveResourcePackUrl } from "@/engine/assets/resourcepack.ts";
import { toProxyAssetUrl } from "@/engine/assets/proxy.ts";

const textureCache = new Map<string, HTMLImageElement>()

export function getUnitTexture(type: string): HTMLImageElement {
  const urlFromPack = getUnitStringParam(type, 'textureUrl').trim()
  return getTexture(urlFromPack ? resolveResourcePackUrl(urlFromPack) : ``)
}

export function getCursorTexture(): HTMLImageElement {
  return getTexture(`/assets/cursor.png`)
}

function getTexture(url: string): HTMLImageElement {
  let img = textureCache.get(url)
  if (img) return img

  img = new Image()
  const proxyUrl = toProxyAssetUrl(url)
  img.onerror = () => {
    if (!proxyUrl || img!.src === proxyUrl) return
    img!.src = proxyUrl
  }
  img.src = url
  textureCache.set(url, img)

  return img
}

export function preloadTextures(): void {
  for (const type of getSpawnUnitTypes()) {
    if (type === unitType.MESSENGER) continue;
    getUnitTexture(type)
  }
  getCursorTexture();
}
