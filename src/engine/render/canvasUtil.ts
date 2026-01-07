export function drawDashedArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color = 'white',
  zoom = 1
) {
  const headLen = 8 * zoom

  const dx = to.x - from.x
  const dy = to.y - from.y
  const angle = Math.atan2(dy, dx)

  ctx.save()

  ctx.strokeStyle = color
  ctx.lineWidth = 2 * zoom
  ctx.setLineDash([6 * zoom, 4 * zoom])

  // линия
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()

  ctx.setLineDash([])

  // стрелка
  ctx.beginPath()
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(
    to.x - headLen * Math.cos(angle - Math.PI / 6),
    to.y - headLen * Math.sin(angle - Math.PI / 6)
  )
  ctx.lineTo(
    to.x - headLen * Math.cos(angle + Math.PI / 6),
    to.y - headLen * Math.sin(angle + Math.PI / 6)
  )
  ctx.closePath()

  ctx.fillStyle = color
  ctx.fill()

  ctx.restore()
}

function drawMoveIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  color: string
) {
  ctx.save()

  ctx.translate(x, y)
  ctx.rotate(angle - 80)

  ctx.fillStyle = color
  ctx.font = `${size * 2}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillText('👣', 0, 0)

  ctx.restore()
}

export function drawMoveArrowChainIcons(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  zoom: number
) {
  // ===== WORLD SPACE =====
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return

  const angle = Math.atan2(dy, dx)
  const dirX = Math.cos(angle)
  const dirY = Math.sin(angle)

  // 🔒 фиксированная геометрия в мире
  const step = 64          // расстояние между иконками
  const arrowOffset = 14  // смещение стрелки вперёд

  for (let d = step / 2; d < dist; d += step) {
    // точка в МИРЕ
    const wx = from.x + dirX * d
    const wy = from.y + dirY * d

    const awx = from.x + dirX * (d + arrowOffset)
    const awy = from.y + dirY * (d + arrowOffset)

    // ===== SCREEN SPACE =====
    const p  = window.ROOM_WORLD.camera.worldToScreen({ x: wx,  y: wy  })
    const ap = window.ROOM_WORLD.camera.worldToScreen({ x: awx, y: awy })

    const size = 6 * zoom

    drawMoveIcon(ctx, p.x, p.y, angle, size, color)
    // drawSmallArrow(ctx, ap.x, ap.y, angle, size * 0.9, color)
  }
}

function drawSmallArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  color: string
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, -size * 0.6)
  ctx.lineTo(-size, size * 0.6)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

function drawAttackIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  color: string
) {
  ctx.save()

  ctx.translate(x, y)
  ctx.rotate(angle)

  ctx.fillStyle = color
  ctx.font = `${size * 2}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillText('⚔', 0, 0)

  ctx.restore()
}

export function drawAttackWaveIcons(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  zoom: number
) {
  // ===== WORLD SPACE =====
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return

  const angle = Math.atan2(dy, dx)
  const dirX = Math.cos(angle)
  const dirY = Math.sin(angle)

  const perpX = -dirY
  const perpY = dirX

  // 🔒 фиксированная геометрия в МИРЕ
  const wavePeriod = 48
  const waveAmp = 6

  let k = 0

  for (let d = wavePeriod / 2; d < dist; d += wavePeriod / 2) {
    const sign = 1
    const wave = waveAmp * sign

    // точка В МИРЕ
    const wx = from.x + dirX * d + perpX * wave
    const wy = from.y + dirY * d + perpY * wave

    const awx =
      from.x +
      dirX * (d + 14) +
      perpX * wave

    const awy =
      from.y +
      dirY * (d + 14) +
      perpY * wave

    // ===== SCREEN SPACE =====
    const p  = window.ROOM_WORLD.camera.worldToScreen({ x: wx,  y: wy  })
    const ap = window.ROOM_WORLD.camera.worldToScreen({ x: awx, y: awy })

    const size = 6 * zoom

    drawAttackIcon(ctx, p.x, p.y, angle, size, color)
    drawSmallArrow(ctx, ap.x, ap.y, angle, size * 0.9, color)

    k++
  }
}



