export type ParsedColorMask = {
  entities: string[]
  labels: Uint16Array
  width: number
  height: number
  labelByEntity: Record<string, number>
  sourceWidth: number
  sourceHeight: number
  sampleStep: number
}

export type LayerPoints = {
  points: Array<[number, number]>
  layerLabel: number
  step: number
}

export type MaskComponent = {
  area: number
  centroidX: number
  centroidY: number
  minX: number
  maxX: number
  minY: number
  maxY: number
  pixels: Array<[number, number]>
}

export type PixelOccupancy = {
  occ: Set<string>
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}

function normalizeColorTriplet(rawColor: unknown): [number, number, number] | null {
  if (!Array.isArray(rawColor) || rawColor.length < 3) return null
  const r = Number(rawColor[0])
  const g = Number(rawColor[1])
  const b = Number(rawColor[2])
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b))),
  ]
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

export async function parseColorMaskFromImageData(
  maskImageData: Uint8ClampedArray,
  width: number,
  height: number,
  meta: Record<string, unknown>,
  options: {
    onProgress?: (ratio: number) => void
    chunkRows?: number
    targetMaxSide?: number
  } = {}
): Promise<ParsedColorMask> {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
  const chunkRows = Math.max(1, Math.round(Number(options.chunkRows ?? 64)))
  const targetMaxSide = Math.max(256, Math.round(Number(options.targetMaxSide ?? 2048)))
  if (!(maskImageData instanceof Uint8ClampedArray) || maskImageData.length < width * height * 4) {
    throw new Error('invalid_png_mask_data')
  }

  const entityToColorRaw =
    meta && typeof meta === 'object' ? (meta.entity_to_color as Record<string, unknown>) : null
  if (!entityToColorRaw || typeof entityToColorRaw !== 'object') {
    throw new Error('invalid_object_map_meta')
  }

  const entities = Object.keys(entityToColorRaw)
  if (!entities.length) throw new Error('empty_object_map_entities')

  const colorToLabel = new Map<string, number>()
  const labelByEntity: Record<string, number> = {}
  for (let i = 0; i < entities.length; i += 1) {
    const entity = entities[i]!
    const color = normalizeColorTriplet(entityToColorRaw[entity])
    if (!color) continue
    labelByEntity[entity] = i + 1
    colorToLabel.set(`${color[0]},${color[1]},${color[2]}`, i + 1)
  }
  if (!Object.keys(labelByEntity).length) throw new Error('invalid_object_map_meta_colors')

  const sampleStep = Math.max(1, Math.ceil(Math.max(width, height) / targetMaxSide))
  const sampledWidth = Math.max(1, Math.ceil(width / sampleStep))
  const sampledHeight = Math.max(1, Math.ceil(height / sampleStep))
  const labels = new Uint16Array(sampledWidth * sampledHeight)

  for (let y = 0; y < sampledHeight; y += 1) {
    const srcY = Math.min(height - 1, y * sampleStep)
    const rowOffset = y * sampledWidth
    for (let x = 0; x < sampledWidth; x += 1) {
      const srcX = Math.min(width - 1, x * sampleStep)
      const pixelIndex = (srcY * width + srcX) * 4
      const r = maskImageData[pixelIndex]!
      const g = maskImageData[pixelIndex + 1]!
      const b = maskImageData[pixelIndex + 2]!
      labels[rowOffset + x] = colorToLabel.get(`${r},${g},${b}`) ?? 0
    }
    if (onProgress && (y % chunkRows === 0 || y === sampledHeight - 1)) {
      onProgress(Math.max(0, Math.min(1, (y + 1) / sampledHeight)))
      await nextAnimationFrame()
    }
  }

  return {
    entities,
    labels,
    width: sampledWidth,
    height: sampledHeight,
    labelByEntity,
    sourceWidth: width,
    sourceHeight: height,
    sampleStep,
  }
}

export function extractLayerPointsFromMask(
  parsedMask: ParsedColorMask,
  layerName: string,
  samplingStep: number
): LayerPoints {
  const layerLabel = parsedMask.labelByEntity[layerName]
  if (!layerLabel) return { points: [], layerLabel: -1, step: 1 }

  const { labels, width, height } = parsedMask
  const step = Math.max(1, Math.round(samplingStep))
  const points: Array<[number, number]> = []
  for (let y = 0; y < height; y += step) {
    const rowOffset = y * width
    for (let x = 0; x < width; x += step) {
      if (labels[rowOffset + x] === layerLabel) points.push([x, y])
    }
  }
  return { points, layerLabel, step }
}

export function extractLayerComponentsFromMask(
  parsedMask: ParsedColorMask,
  layerName: string,
  minPixels = 1
): MaskComponent[] {
  const layerLabel = parsedMask.labelByEntity[layerName]
  if (!layerLabel) return []

  const { labels, width, height } = parsedMask
  const visited = new Uint8Array(width * height)
  const components: MaskComponent[] = []
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIdx = y * width + x
      if (visited[startIdx] || labels[startIdx] !== layerLabel) continue

      const queue = [startIdx]
      visited[startIdx] = 1
      let qIndex = 0
      let area = 0
      let sumX = 0
      let sumY = 0
      let minX = x
      let maxX = x
      let minY = y
      let maxY = y
      const pixels: Array<[number, number]> = []

      while (qIndex < queue.length) {
        const currentIdx = queue[qIndex++]!
        const cx = currentIdx % width
        const cy = (currentIdx - cx) / width
        area += 1
        sumX += cx
        sumY += cy
        minX = Math.min(minX, cx)
        maxX = Math.max(maxX, cx)
        minY = Math.min(minY, cy)
        maxY = Math.max(maxY, cy)
        pixels.push([cx, cy])

        for (let i = 0; i < dirs.length; i += 1) {
          const nx = cx + dirs[i]![0]!
          const ny = cy + dirs[i]![1]!
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const neighborIdx = ny * width + nx
          if (visited[neighborIdx] || labels[neighborIdx] !== layerLabel) continue
          visited[neighborIdx] = 1
          queue.push(neighborIdx)
        }
      }

      if (area < minPixels) continue
      components.push({
        area,
        centroidX: sumX / area,
        centroidY: sumY / area,
        minX,
        maxX,
        minY,
        maxY,
        pixels,
      })
    }
  }

  return components
}

export function buildPixelOccupancyFromComponents(
  components: MaskComponent[],
  padding = 0
): PixelOccupancy {
  const points: Array<[number, number]> = []
  for (let i = 0; i < components.length; i += 1) {
    const pixels = components[i]!.pixels
    for (let j = 0; j < pixels.length; j += 1) points.push(pixels[j]!)
  }
  return buildPixelOccupancyFromPoints(points, padding)
}

export function buildPixelOccupancyFromPoints(
  points: Array<[number, number]>,
  padding = 0
): PixelOccupancy {
  const occ = new Set<string>()
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  }

  for (let i = 0; i < points.length; i += 1) {
    const px = points[i]![0]
    const py = points[i]![1]
    const x0 = px - padding
    const x1 = px + padding
    const y0 = py - padding
    const y1 = py + padding
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        occ.add(`${x},${y}`)
        bounds.minX = Math.min(bounds.minX, x)
        bounds.maxX = Math.max(bounds.maxX, x)
        bounds.minY = Math.min(bounds.minY, y)
        bounds.maxY = Math.max(bounds.maxY, y)
      }
    }
  }

  return { occ, bounds }
}

export function filterPointsOutsideOccupancy(
  points: Array<[number, number]>,
  occupancyInfo: PixelOccupancy
) {
  if (!occupancyInfo?.occ?.size) return points
  const { occ, bounds } = occupancyInfo
  return points.filter(([x, y]) => {
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) return true
    return !occ.has(`${x},${y}`)
  })
}

export function filterComponentsOutsideOccupancy(
  components: MaskComponent[],
  occupancyInfo: PixelOccupancy
) {
  if (!occupancyInfo?.occ?.size) return components
  const { occ, bounds } = occupancyInfo
  return components.filter((component) => {
    if (
      component.maxX < bounds.minX ||
      component.minX > bounds.maxX ||
      component.maxY < bounds.minY ||
      component.minY > bounds.maxY
    ) {
      return true
    }
    for (let i = 0; i < component.pixels.length; i += 1) {
      const key = `${component.pixels[i]![0]},${component.pixels[i]![1]}`
      if (occ.has(key)) return false
    }
    return true
  })
}

export function resolveLayerSamplingStep(
  layerSamplingSteps: Record<string, number>,
  layerName: string
) {
  return Math.max(1, Math.round(Number(layerSamplingSteps[layerName] ?? 1)))
}
