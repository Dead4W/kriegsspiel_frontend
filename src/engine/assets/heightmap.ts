/* ============================================
 * Height from additive RGB image
 * height = R + G + B
 * ============================================ */

import type { vec2 } from "@/engine"

export type HeightSampler = {
  getHeightAt(pos: vec2): number
}

/* ---------- fallback ---------- */

const FALLBACK_HEIGHT = 0

/* ---------- Чтение высоты одного пикселя ---------- */

function readPixelHeight(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return FALLBACK_HEIGHT
  }

  const i = (y * width + x) * 4

  const a = data[i + 3]!
  if (a < 10) return FALLBACK_HEIGHT

  const r = data[i]!
  const g = data[i + 1]!
  const b = data[i + 2]!

  // additive encoding
  return r + g + b
}

/* ============================================
 * API
 * ============================================ */

export async function createHeightSampler(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<HeightSampler> {

  function getHeightAt(pos: vec2): number {

    const x = pos.x
    const y = pos.y

    if (
      x < 0 || y < 0 ||
      x >= width - 1 || y >= height - 1
    ) {
      return FALLBACK_HEIGHT
    }

    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const x1 = x0 + 1
    const y1 = y0 + 1

    const fx = x - x0
    const fy = y - y0

    const h00 = readPixelHeight(data, width, height, x0, y0)
    const h10 = readPixelHeight(data, width, height, x1, y0)
    const h01 = readPixelHeight(data, width, height, x0, y1)
    const h11 = readPixelHeight(data, width, height, x1, y1)

    const h0 = h00 * (1 - fx) + h10 * fx
    const h1 = h01 * (1 - fx) + h11 * fx

    return h0 * (1 - fy) + h1 * fy
  }

  return { getHeightAt }
}
