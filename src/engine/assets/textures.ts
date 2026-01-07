import {unitType} from "@/engine";

const textureCache = new Map<string, HTMLImageElement>()

export function getUnitTexture(type: string): HTMLImageElement {
  return getTexture(`/assets/units/${type}.png`)
}

export function getCursorTexture(): HTMLImageElement {
  return getTexture(`/assets/cursor.png`)
}

function getTexture(url: string): HTMLImageElement {
  let img = textureCache.get(url)
  if (img) return img

  img = new Image()
  img.src = url
  textureCache.set(url, img)

  return img
}

export function preloadTextures(): void {
  for (const type of Object.values(unitType)) {
    getUnitTexture(type)
  }
  getCursorTexture();
}
