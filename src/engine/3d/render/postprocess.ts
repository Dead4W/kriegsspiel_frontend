function buildPointKey(x: number, y: number) {
  return `${x},${y}`
}

function parsePointKey(key: string): [number, number] {
  const parts = key.split(',')
  return [Number(parts[0]), Number(parts[1])]
}

function countNeighbors8(pointSet: Set<string>, x: number, y: number) {
  let count = 0
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      if (!ox && !oy) continue
      if (pointSet.has(buildPointKey(x + ox, y + oy))) count += 1
    }
  }
  return count
}

function majoritySmoothRoadPointSet(
  pointSet: Set<string>,
  minNeighborsToKeep: number,
  minNeighborsToAdd: number
) {
  if (!pointSet.size) return pointSet
  const candidateSet = new Set<string>()
  pointSet.forEach((key) => {
    const [x, y] = parsePointKey(key)
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) candidateSet.add(buildPointKey(x + ox, y + oy))
    }
  })

  const next = new Set<string>()
  candidateSet.forEach((key) => {
    const [x, y] = parsePointKey(key)
    const neighbors = countNeighbors8(pointSet, x, y)
    const exists = pointSet.has(key)
    if (exists && neighbors >= minNeighborsToKeep) next.add(key)
    else if (!exists && neighbors >= minNeighborsToAdd) next.add(key)
  })
  return next
}

function filterSmallRoadComponents(pointSet: Set<string>, minComponentSize: number) {
  if (!pointSet.size || minComponentSize <= 1) return pointSet
  const visited = new Set<string>()
  const kept = new Set<string>()
  const offsets = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ]

  pointSet.forEach((startKey) => {
    if (visited.has(startKey)) return
    const queue = [startKey]
    const component: string[] = []
    visited.add(startKey)
    while (queue.length) {
      const key = queue.pop()!
      component.push(key)
      const [x, y] = parsePointKey(key)
      for (let i = 0; i < offsets.length; i += 1) {
        const nx = x + offsets[i]![0]!
        const ny = y + offsets[i]![1]!
        const nKey = buildPointKey(nx, ny)
        if (!pointSet.has(nKey) || visited.has(nKey)) continue
        visited.add(nKey)
        queue.push(nKey)
      }
    }
    if (component.length >= minComponentSize) {
      for (let i = 0; i < component.length; i += 1) kept.add(component[i]!)
    }
  })
  return kept
}

export function postProcessRoadPoints(
  points: Array<[number, number]>,
  config: {
    passes?: number
    minNeighborsToKeep?: number
    minNeighborsToAdd?: number
    minComponentSize?: number
  } = {}
) {
  if (!points.length) return points
  const passes = Math.max(0, Math.round(Number(config.passes ?? 1)))
  const minNeighborsToKeep = Math.max(0, Math.round(Number(config.minNeighborsToKeep ?? 2)))
  const minNeighborsToAdd = Math.max(
    minNeighborsToKeep,
    Math.round(Number(config.minNeighborsToAdd ?? 6))
  )
  const minComponentSize = Math.max(1, Math.round(Number(config.minComponentSize ?? 4)))
  let set = new Set<string>()
  for (let i = 0; i < points.length; i += 1) {
    const x = Math.round(points[i]![0])
    const y = Math.round(points[i]![1])
    set.add(buildPointKey(x, y))
  }
  for (let pass = 0; pass < passes; pass += 1) {
    set = majoritySmoothRoadPointSet(set, minNeighborsToKeep, minNeighborsToAdd)
  }
  set = filterSmallRoadComponents(set, minComponentSize)
  if (!set.size) return points
  const processed: Array<[number, number]> = []
  set.forEach((key) => processed.push(parsePointKey(key)))
  return processed
}

