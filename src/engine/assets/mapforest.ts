function isForestPixel(r: number, g: number, b: number) {
  r /= 255
  g /= 255
  b /= 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  // слишком серое / фон
  if (delta < 0.05) return false

  let h = 0
  if (delta !== 0) {
    if (max === g) {
      h = (b - r) / delta + 2
    } else if (max === r) {
      h = (g - b) / delta
    } else {
      h = (r - g) / delta + 4
    }
    h *= 60
    if (h < 0) h += 360
  }

  const s = delta / max
  const v = max

  // 🎯 параметры под твой пример
  return (
    h > 55 && h < 115 &&   // жёлто-зелёный
    s > 0.25 && s < 0.75 && // не неон и не серый
    v > 0.35 && v < 0.85   // не фон и не белый
  )
}

export async function buildForestMap(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  radius = 3
): Promise<OffscreenCanvas | HTMLCanvasElement> {

  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height })

  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, width, height)

  // исходное изображение
  const srcCanvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height })

  const srcCtx = srcCanvas.getContext('2d')!
  srcCtx.drawImage(bitmap, 0, 0, width, height)

  const img = srcCtx.getImageData(0, 0, width, height)
  const d = img.data

  ctx.fillStyle = 'rgba(0,255,0,1)'

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4

      const r = d[i]!
      const g = d[i + 1]!
      const b = d[i + 2]!

      if (isForestPixel(r, g, b)) {
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  return canvas
}
