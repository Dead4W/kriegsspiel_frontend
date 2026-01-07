export function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export function getTeamColor(team: string, isContrast: boolean = false) {
  switch (team) {
    case 'red':
      if (isContrast) {
        return { r: 255, g: 39, b: 30 }   // red-500
      } else {
        return { r: 239, g: 68, b: 68 }   // red-500
      }
    case 'blue':
      if (isContrast) {
        return { r: 20, g: 80, b: 255 }  // blue-500
      } else {
        return { r: 59, g: 130, b: 246 }  // blue-500
      }
    default:
      if (isContrast) {
        return { r: 200, g: 200, b: 200 } // neutral
      } else {
        return { r: 100, g: 100, b: 100 } // neutral
      }
  }
}
