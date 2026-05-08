export type SpatialHash = {
  hash: Map<string, Array<[number, number]>>
  cellSize: number
}

export function buildPointSpatialHash(points: Array<[number, number]>, cellSize: number): SpatialHash {
  const hash = new Map<string, Array<[number, number]>>()
  const safeCell = Math.max(1, Number(cellSize ?? 10))
  if (!points || !points.length) return { hash, cellSize: safeCell }
  for (let i = 0; i < points.length; i += 1) {
    const [x, y] = points[i]!
    const cx = Math.floor(x / safeCell)
    const cy = Math.floor(y / safeCell)
    const key = `${cx},${cy}`
    const bucket = hash.get(key)
    if (bucket) bucket.push([x, y])
    else hash.set(key, [[x, y]])
  }
  return { hash, cellSize: safeCell }
}

export function insertPointIntoSpatialHash(spatialHash: SpatialHash, px: number, py: number) {
  if (!spatialHash || !spatialHash.hash) return
  const cellSize = Math.max(1, Number(spatialHash.cellSize ?? 10))
  const cx = Math.floor(px / cellSize)
  const cy = Math.floor(py / cellSize)
  const key = `${cx},${cy}`
  const bucket = spatialHash.hash.get(key)
  if (bucket) bucket.push([px, py])
  else spatialHash.hash.set(key, [[px, py]])
}

export function findNearestPointWithinRadius(
  spatialHash: SpatialHash,
  px: number,
  py: number,
  radiusPx: number
) {
  if (!spatialHash || !spatialHash.hash || !spatialHash.hash.size) return null
  const radius = Math.max(0, Number(radiusPx ?? 0))
  if (radius <= 0) return null
  const cellSize = spatialHash.cellSize
  const minCellX = Math.floor((px - radius) / cellSize)
  const maxCellX = Math.floor((px + radius) / cellSize)
  const minCellY = Math.floor((py - radius) / cellSize)
  const maxCellY = Math.floor((py + radius) / cellSize)
  const radiusSq = radius * radius
  let best: [number, number] | null = null
  let bestDistSq = radiusSq

  for (let cy = minCellY; cy <= maxCellY; cy += 1) {
    for (let cx = minCellX; cx <= maxCellX; cx += 1) {
      const bucket = spatialHash.hash.get(`${cx},${cy}`)
      if (!bucket) continue
      for (let i = 0; i < bucket.length; i += 1) {
        const dx = bucket[i]![0] - px
        const dy = bucket[i]![1] - py
        const distSq = dx * dx + dy * dy
        if (distSq > bestDistSq) continue
        bestDistSq = distSq
        best = bucket[i]!
      }
    }
  }
  return best
}

export function collectPointsWithinRadius(
  spatialHash: SpatialHash,
  px: number,
  py: number,
  radiusPx: number
) {
  if (!spatialHash || !spatialHash.hash || !spatialHash.hash.size) return []
  const radius = Math.max(0, Number(radiusPx ?? 0))
  if (radius <= 0) return []
  const cellSize = spatialHash.cellSize
  const minCellX = Math.floor((px - radius) / cellSize)
  const maxCellX = Math.floor((px + radius) / cellSize)
  const minCellY = Math.floor((py - radius) / cellSize)
  const maxCellY = Math.floor((py + radius) / cellSize)
  const radiusSq = radius * radius
  const nearby: Array<[number, number]> = []
  for (let cy = minCellY; cy <= maxCellY; cy += 1) {
    for (let cx = minCellX; cx <= maxCellX; cx += 1) {
      const bucket = spatialHash.hash.get(`${cx},${cy}`)
      if (!bucket) continue
      for (let i = 0; i < bucket.length; i += 1) {
        const dx = bucket[i]![0] - px
        const dy = bucket[i]![1] - py
        if (dx * dx + dy * dy <= radiusSq) nearby.push(bucket[i]!)
      }
    }
  }
  return nearby
}

