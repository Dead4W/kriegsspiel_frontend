import type {vec2, world} from '@/engine'
import type {
  OverlayCircle,
  OverlayLine,
  OverlayRect,
  OverlayText
} from '@/engine/types/overlayTypes.ts'
import {debugPerformance} from "@/engine/debugPerformance.ts";
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";

type Cam = {
  zoom: number
  worldToScreen(p: { x: number; y: number }): { x: number; y: number }
}

export class overlaylayer {
  private lineDashOffset = 0
  private lastDastOffsetEdit = 0
  private readonly previewDebugArea = {
    from: {x: 1780, y: 1040},
    to: {x: 1820, y: 1140},
    confidence: 0.56,
  }

  draw(ctx: CanvasRenderingContext2D, w: world) {
    const cam = w.camera as Cam
    const canvas = ctx.canvas

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // ===== группировка =====
    const lines: OverlayLine[] = []
    const circles: OverlayCircle[] = []
    const texts: OverlayText[] = []
    const rects: OverlayRect[] = []

    debugPerformance('group', () => {
      for (const item of w.overlay.list()) {
        switch (item.type) {
          case 'line': lines.push(item); break
          case 'circle': circles.push(item); break
          case 'text': texts.push(item); break
          case 'rect': rects.push(item); break
        }
      }
    })

    // ===== отрисовка =====
    this.drawLinesBatched(ctx, cam, canvas, lines)
    for (const c of circles) this.drawCircle(ctx, cam, canvas, c)
    for (const r of rects) this.drawRect(ctx, cam, canvas, r)
    for (const t of texts) this.drawText(ctx, cam, canvas, t)
    this.drawDebugPreviewArea(ctx, cam, canvas)
    if (performance.now() - this.lastDastOffsetEdit > 10) { // every 10ms
      this.lineDashOffset++
      this.lastDastOffsetEdit = performance.now()
    }
  }

  private drawDebugPreviewArea(
    ctx: CanvasRenderingContext2D,
    cam: Cam,
    canvas: HTMLCanvasElement,
  ) {
    if (!window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.DEBUG_MODE]) return

    const {from, to, confidence} = this.previewDebugArea
    const clampedConfidence = Math.min(1, Math.max(0, confidence))
    const a = cam.worldToScreen(from)
    const b = cam.worldToScreen(to)
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.abs(a.x - b.x)
    const h = Math.abs(a.y - b.y)

    if (
      x + w < 0 ||
      y + h < 0 ||
      x > canvas.width ||
      y > canvas.height
    ) return

    ctx.save()
    ctx.fillStyle = 'rgba(245, 158, 11, 0.18)'
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.95)'
    ctx.lineWidth = Math.max(1, 2 * cam.zoom)
    ctx.setLineDash([8 * cam.zoom, 6 * cam.zoom])
    ctx.lineDashOffset = -this.lineDashOffset

    ctx.fillRect(x, y, w, h)
    ctx.strokeRect(x, y, w, h)

    ctx.setLineDash([])
    const centerX = x + w / 2
    const centerY = y + h / 2
    ctx.beginPath()
    ctx.moveTo(centerX - 8, centerY)
    ctx.lineTo(centerX + 8, centerY)
    ctx.moveTo(centerX, centerY - 8)
    ctx.lineTo(centerX, centerY + 8)
    ctx.stroke()

    ctx.font = `${Math.max(11, 12 * cam.zoom)}px monospace`
    ctx.fillStyle = 'rgba(254, 240, 138, 1)'
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)'
    ctx.lineWidth = Math.max(1, 2 * cam.zoom)
    const label = `DBG area X:${from.x}-${to.x} Y:${from.y}-${to.y} conf:${clampedConfidence.toFixed(2)}`
    ctx.strokeText(label, x + 10, y - 10)
    ctx.fillText(label, x + 10, y - 10)
    ctx.restore()
  }

  // ============================================================
  // ======================= LINES ==============================
  // ============================================================

  private drawLinesBatched(
    ctx: CanvasRenderingContext2D,
    cam: Cam,
    canvas: HTMLCanvasElement,
    lines: OverlayLine[]
  ) {
    // styleKey → lines
    const batches = new Map<string, OverlayLine[]>()

    debugPerformance('batchesGroup', () => {
      for (const l of lines) {
        const key = this.lineStyleKey(l, cam)
        let arr = batches.get(key)
        if (!arr) {
          arr = []
          batches.set(key, arr)
        }
        arr.push(l)
      }
    })

    for (const [key, batch] of batches) {
      debugPerformance('batch', () => {
        // стиль из key
        const style = JSON.parse(key)

        ctx.strokeStyle = style.color
        ctx.lineWidth = style.width
        ctx.setLineDash(style.dash)
        ctx.lineDashOffset = style.dashOffset * this.lineDashOffset

        ctx.beginPath()

        for (const l of batch) {
          let a: vec2 = {x: 0, y: 0};
          let b: vec2 = {x: 0, y: 0};

          debugPerformance('culling', () => {
            a = cam.worldToScreen(l.from)
            b = cam.worldToScreen(l.to)
          })

          if (!this.lineVisible(canvas, a, b)) continue

          debugPerformance('drawLine', () => {
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
          })
        }

        ctx.stroke()
      })
    }

    ctx.setLineDash([])
    ctx.lineDashOffset = 0
  }

  private lineStyleKey(item: OverlayLine, cam: Cam): string {
    return JSON.stringify({
      color: item.color ?? '#22d3ee',
      width: (item.width ?? 2) * cam.zoom,
      dash: item.dash?.map(v => v * cam.zoom) ?? [],
      dashOffset: (item.dashOffset ?? 0) * cam.zoom
    })
  }

  private lineVisible(
    canvas: HTMLCanvasElement,
    a: { x: number; y: number },
    b: { x: number; y: number }
  ): boolean {
    const minX = Math.min(a.x, b.x)
    const maxX = Math.max(a.x, b.x)
    const minY = Math.min(a.y, b.y)
    const maxY = Math.max(a.y, b.y)

    return !(
      maxX < 0 ||
      maxY < 0 ||
      minX > canvas.width ||
      minY > canvas.height
    )
  }

  // ============================================================
  // ======================= CIRCLE =============================
  // ============================================================

  private drawCircle(
    ctx: CanvasRenderingContext2D,
    cam: Cam,
    canvas: HTMLCanvasElement,
    item: OverlayCircle
  ) {
    const c = cam.worldToScreen(item.center)
    const r = item.radius * cam.zoom

    if (
      c.x + r < 0 ||
      c.y + r < 0 ||
      c.x - r > canvas.width ||
      c.y - r > canvas.height
    ) return

    ctx.fillStyle = item.color ?? '#a855f7'
    ctx.strokeStyle = item.strokeColor ?? 'black'
    ctx.lineWidth = (item.strokeWidth ?? 2) * cam.zoom

    ctx.beginPath()
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
    ctx.fill()
    if (item.strokeColor) ctx.stroke()
  }

  // ============================================================
  // ======================== RECT ==============================
  // ============================================================

  private drawRect(
    ctx: CanvasRenderingContext2D,
    cam: Cam,
    canvas: HTMLCanvasElement,
    item: OverlayRect
  ) {
    const a = cam.worldToScreen(item.from)
    const b = cam.worldToScreen(item.to)

    const w = Math.abs(a.x - b.x)
    const h = Math.abs(a.y - b.y)
    const centerX = (a.x + b.x) / 2
    const centerY = (a.y + b.y) / 2
    const x = centerX - w / 2
    const y = centerY - h / 2

    if (
      x + w < 0 ||
      y + h < 0 ||
      x > canvas.width ||
      y > canvas.height
    ) return

    ctx.save()
    ctx.translate(centerX, centerY)
    if (item.angle) {
      ctx.rotate(item.angle)
    }

    if (item.fillColor) {
      ctx.fillStyle = item.fillColor
      ctx.fillRect(-w / 2, -h / 2, w, h)
    }

    ctx.strokeStyle = item.color ?? '#3cff00'
    ctx.lineWidth = (item.width ?? 1) * cam.zoom
    ctx.strokeRect(-w / 2, -h / 2, w, h)
    ctx.restore()
  }

  // ============================================================
  // ========================= TEXT =============================
  // ============================================================

  private drawText(
    ctx: CanvasRenderingContext2D,
    cam: Cam,
    canvas: HTMLCanvasElement,
    item: OverlayText
  ) {
    const p = cam.worldToScreen(item.pos)

    if (
      p.x < 0 ||
      p.y < 0 ||
      p.x > canvas.width ||
      p.y > canvas.height
    ) return

    ctx.save()
    ctx.translate(p.x, p.y)
    if (item.angle) ctx.rotate(item.angle)

    const size = item.size ?? 12
    const fontSize = size * cam.zoom
    const font = item.font ?? 'sans-serif'

    ctx.font = `${fontSize}px ${font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (item.strokeColor && item.strokeWidth) {
      ctx.strokeStyle = item.strokeColor
      ctx.lineWidth = item.strokeWidth * cam.zoom
      ctx.strokeText(item.text, 0, 0)
    }

    ctx.fillStyle = item.color ?? 'white'
    ctx.fillText(item.text, 0, 0)

    ctx.restore()
  }
}
