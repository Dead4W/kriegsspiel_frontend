export function hash2D(x: number, y: number, seed = 0) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 982451653)
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 1274126177) >>> 0
  return h / 4294967295
}

export function estimateComponentAngleRadians(component: {
  pixels: Array<[number, number]>
  centroidX: number
  centroidY: number
}) {
  if (!component.pixels || component.pixels.length < 2) return 0
  let meanX = 0
  let meanY = 0
  for (let i = 0; i < component.pixels.length; i += 1) {
    meanX += component.pixels[i]![0]
    meanY += component.pixels[i]![1]
  }
  meanX /= component.pixels.length
  meanY /= component.pixels.length

  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let i = 0; i < component.pixels.length; i += 1) {
    const dx = component.pixels[i]![0] - meanX
    const dy = component.pixels[i]![1] - meanY
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy)
}

export function componentExtentsAlongAngle(
  component: { pixels: Array<[number, number]>; centroidX: number; centroidY: number },
  angleRadians: number
) {
  const cosA = Math.cos(angleRadians)
  const sinA = Math.sin(angleRadians)
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (let i = 0; i < component.pixels.length; i += 1) {
    const x = component.pixels[i]![0] - component.centroidX
    const y = component.pixels[i]![1] - component.centroidY
    const u = x * cosA + y * sinA
    const v = -x * sinA + y * cosA
    minU = Math.min(minU, u)
    maxU = Math.max(maxU, u)
    minV = Math.min(minV, v)
    maxV = Math.max(maxV, v)
  }
  return {
    lengthPx: Math.max(1, maxU - minU + 1),
    widthPx: Math.max(1, maxV - minV + 1),
  }
}

