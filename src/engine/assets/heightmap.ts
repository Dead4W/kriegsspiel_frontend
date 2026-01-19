/* ============================================
 * Height from ImageBitmap (on-demand, bilinear)
 * ============================================ */

import type {vec2} from "@/engine";

export type HeightColor = {
  r: number
  g: number
  b: number
  h: number
}

/* ---------- Легенда высот ---------- */

// const HEIGHT_LEGEND: HeightColor[] = [
//   { r: 255, g: 140, b: 140, h: 230 },
//   { r: 255, g: 93, b: 93, h: 224 },
//   { r: 255, g: 37, b: 37, h: 217 },
//   { r: 255, g: 11, b: 0, h: 211 },
//   { r: 255, g: 62, b: 0, h: 205 },
//   { r: 255, g: 113, b: 0, h: 199 },
//   { r: 255, g: 166, b: 0, h: 193 },
//   { r: 255, g: 212, b: 0, h: 188 },
//   { r: 243, g: 255, b: 0, h: 182 },
//   { r: 194, g: 255, b: 0, h: 177 },
//   { r: 144, g: 255, b: 0, h: 172 },
//   { r: 92, g: 255, b: 0, h: 167 },
//   { r: 36, g: 255, b: 0, h: 162 },
//   { r: 0, g: 255, b: 9, h: 158 },
//   { r: 0, g: 255, b: 58, h: 154 },
//   { r: 0, g: 255, b: 111, h: 150 },
//   { r: 0, g: 255, b: 169, h: 146 },
//   { r: 0, g: 255, b: 220, h: 143 },
//   { r: 0, g: 252, b: 255, h: 141 },
//   { r: 0, g: 192, b: 255, h: 139 },
// ]

const HEIGHT_LEGEND: HeightColor[] = [
  // красные
  { r: 255, g: 160, b: 160, h: 232 },
  { r: 255, g: 140, b: 140, h: 230 },
  { r: 255, g: 115, b: 115, h: 227 },
  { r: 255, g: 93,  b: 93,  h: 224 },
  { r: 255, g: 65,  b: 65,  h: 220 },
  { r: 255, g: 37,  b: 37,  h: 217 },
  { r: 255, g: 20,  b: 10,  h: 214 },
  { r: 255, g: 11,  b: 0,   h: 211 },

  // оранжевые
  { r: 255, g: 40,  b: 0,   h: 208 },
  { r: 255, g: 62,  b: 0,   h: 205 },
  { r: 255, g: 88,  b: 0,   h: 202 },
  { r: 255, g: 113, b: 0,   h: 199 },
  { r: 255, g: 140, b: 0,   h: 196 },
  { r: 255, g: 166, b: 0,   h: 193 },
  { r: 255, g: 190, b: 0,   h: 190 },
  { r: 255, g: 212, b: 0,   h: 188 },

  // жёлтые
  { r: 250, g: 235, b: 0,   h: 185 },
  { r: 243, g: 255, b: 0,   h: 182 },
  { r: 220, g: 255, b: 0,   h: 179 },
  { r: 194, g: 255, b: 0,   h: 177 },
  { r: 170, g: 255, b: 0,   h: 174 },
  { r: 144, g: 255, b: 0,   h: 172 },

  // зелёные
  { r: 118, g: 255, b: 0,   h: 169 },
  { r: 92,  g: 255, b: 0,   h: 167 },
  { r: 64,  g: 255, b: 0,   h: 164 },
  { r: 36,  g: 255, b: 0,   h: 162 },
  { r: 18,  g: 255, b: 0,   h: 160 },
  { r: 0,   g: 255, b: 9,   h: 158 },
  { r: 0,   g: 255, b: 34,  h: 156 },
  { r: 0,   g: 255, b: 58,  h: 154 },

  // бирюзовые
  { r: 0,   g: 255, b: 85,  h: 152 },
  { r: 0,   g: 255, b: 111, h: 150 },
  { r: 0,   g: 255, b: 140, h: 148 },
  { r: 0,   g: 255, b: 169, h: 146 },
  { r: 0,   g: 255, b: 195, h: 144 },
  { r: 0,   g: 255, b: 220, h: 143 },

  // голубые
  { r: 0,   g: 240, b: 255, h: 142 },
  { r: 0,   g: 252, b: 255, h: 141 },
  { r: 0,   g: 220, b: 255, h: 140 },
  { r: 0,   g: 192, b: 255, h: 139 },
]

/* ---------- Медиана легенды ---------- */

const FALLBACK_HEIGHT: number = (() => {
  const arr = HEIGHT_LEGEND.map(e => e.h).sort((a, b) => a - b)
  const m = Math.floor(arr.length / 2)
  return arr.length % 2 ? arr[m]! : (arr[m - 1]! + arr[m]!) / 2
})()

/* ---------- Утилиты ---------- */

function colorDistance(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number
) {
  return Math.sqrt(
    (r1 - r2) ** 2 +
    (g1 - g2) ** 2 +
    (b1 - b2) ** 2
  )
}

function getHeightByColor(
  r: number,
  g: number,
  b: number,
  tolerance = 35
): number | null {
  let minDist = Infinity
  let height: number | null = null

  for (const c of HEIGHT_LEGEND) {
    const d = colorDistance(r, g, b, c.r, c.g, c.b)
    if (d < minDist) {
      minDist = d
      height = c.h
    }
  }

  return minDist <= tolerance ? height : null
}

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

  const h = getHeightByColor(
    data[i]!,
    data[i + 1]!,
    data[i + 2]!
  )

  return h ?? FALLBACK_HEIGHT
}

/* ============================================
 * API
 * ============================================ */

export type HeightSampler = {
  getHeightAt(pos: vec2): number
}

/**
 * Bilinear sampler:
 * - принимает float координаты
 * - интерполирует по 4 пикселям
 */
export async function createHeightSampler(
  data: ImageDataArray,
  width: number,
  height: number,
): Promise<HeightSampler> {
  function getHeightAt(pos: vec2): number {
    const x = pos.x;
    const y = pos.y;

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
