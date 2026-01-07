import type { world } from '@/engine'
import type {
  OverlayCircle,
  OverlayLine,
  OverlayRect,
  OverlayText
} from "@/engine/types/overlayTypes.ts";

export class overlaylayer {
  draw(ctx: CanvasRenderingContext2D, w: world) {
    const cam = w.camera

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const item of w.overlay.list()) {
      switch (item.type) {
        case 'line':
          this.drawLine(ctx, cam, item)
          break

        case 'circle':
          this.drawCircle(ctx, cam, item)
          break

        case 'text':
          this.drawText(ctx, cam, item)
          break

        case 'rect':
          this.drawRect(ctx, cam, item)
          break
      }
    }

    ctx.restore()
  }

  private drawLine(
    ctx: CanvasRenderingContext2D,
    cam: any,
    item: OverlayLine
  ) {
    const a = cam.worldToScreen(item.from)
    const b = cam.worldToScreen(item.to)

    ctx.save()

    ctx.strokeStyle = item.color ?? '#22d3ee'
    ctx.lineWidth = (item.width ?? 2) * cam.zoom

    // ===== DASH SUPPORT =====
    if (item.dash?.length) {
      ctx.setLineDash(
        item.dash.map(v => v * cam.zoom) // масштабируем под зум
      )
      ctx.lineDashOffset = item.dashOffset ?? 0
      if (item.dashOffset !== null && item.dashOffset !== undefined) {
        if (item.dashOffset > 0) item.dashOffset += 3;
        if (item.dashOffset < 0) item.dashOffset -= 3;
      }
    } else {
      ctx.setLineDash([])
      ctx.lineDashOffset = 0
    }

    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()

    ctx.restore()
  }

  private drawCircle(ctx: CanvasRenderingContext2D, cam: any, item: OverlayCircle) {
    const c = cam.worldToScreen(item.center)

    ctx.strokeStyle = item.strokeColor ?? 'black'
    ctx.fillStyle = item.color ?? '#a855f7'
    ctx.lineWidth = 2 * cam.zoom

    ctx.beginPath()
    ctx.arc(
      c.x,
      c.y,
      item.radius * cam.zoom,
      0,
      Math.PI * 2
    )

    ctx.fill()
    if (item.strokeColor) ctx.stroke();
  }

  private drawText(ctx: CanvasRenderingContext2D, cam: any, item: OverlayText) {
    const p = cam.worldToScreen(item.pos)

    ctx.save()
    ctx.translate(p.x, p.y)
    if (item.angle) ctx.rotate(item.angle)

    const size = item.size ?? 12
    const fontSize = size * cam.zoom
    const font = item.font ?? 'sans-serif';

    ctx.font = `${fontSize}px ${font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // ===== stroke =====
    if (item.strokeColor && item.strokeWidth) {
      ctx.strokeStyle = item.strokeColor
      ctx.lineWidth = item.strokeWidth * cam.zoom
      ctx.strokeText(item.text, 0, 0)
    }

    // ===== fill =====
    ctx.fillStyle = item.color ?? 'white'
    ctx.fillText(item.text, 0, 0)

    ctx.restore()
  }

  private drawRect(
    ctx: CanvasRenderingContext2D,
    cam: any,
    item: OverlayRect
  ) {
    const a = cam.worldToScreen(item.from)
    const b = cam.worldToScreen(item.to)

    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.abs(a.x - b.x)
    const h = Math.abs(a.y - b.y)

    // заливка
    if (item.fillColor) {
      ctx.fillStyle = item.fillColor
      ctx.fillRect(x, y, w, h)
    }

    // обводка
    ctx.strokeStyle = item.color ?? '#3cff00'
    ctx.lineWidth = (item.width ?? 1) * cam.zoom
    ctx.strokeRect(x, y, w, h)
  }
}
