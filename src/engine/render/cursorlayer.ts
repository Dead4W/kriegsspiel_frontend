import type { world } from '@/engine'
import type { vec2 } from '@/engine'
import { getCursorTexture } from '@/engine/assets/textures'
import { drawRoundRect } from '@/engine/render/util'

const FADE_DELAY = 20_000
const FADE_DURATION = 10_000

export class cursorlayer {
  private cursorTexture = getCursorTexture()

  draw(ctx: CanvasRenderingContext2D, w: world) {
    const cam = w.camera
    const cursors = w.cursor.getRemoteCursors()
    const now = Date.now()

    ctx.save()

    for (const cursor of cursors) {
      if (!cursor.pos) continue

      const age = now - cursor.lastSeen
      if (age > FADE_DELAY + FADE_DURATION) continue

      let alpha = 1
      if (age > FADE_DELAY) {
        alpha = 1 - (age - FADE_DELAY) / FADE_DURATION
      }

      this.drawCursor(ctx, cam, cursor.pos, cursor.name, alpha)
    }

    ctx.restore()
  }

  private drawCursor(
    ctx: CanvasRenderingContext2D,
    cam: any,
    pos: vec2,
    name: string,
    alpha: number
  ) {
    const p = cam.worldToScreen(pos)

    const baseSize = 16
    const size = baseSize

    ctx.save()
    ctx.globalAlpha = alpha

    /* ===== КУРСОР ===== */
    if (this.cursorTexture.complete) {
      ctx.drawImage(
        this.cursorTexture,
        p.x,
        p.y,
        size,
        size
      )
    }

    /* ===== ПОДПИСЬ (КАК У ЮНИТА) ===== */
    const fontSize = 12
    const paddingX = 6
    const paddingY = 3
    const offsetY = 6

    ctx.font = `${fontSize}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const metrics = ctx.measureText(name)
    const textWidth = metrics.width
    const textHeight = fontSize

    const bgWidth = textWidth + paddingX * 2
    const bgHeight = textHeight + paddingY * 2

    const bgX = p.x - bgWidth / 2
    const bgY = p.y - size / 2 - bgHeight - offsetY

    // фон (тот же стиль, что у юнитов)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    drawRoundRect(ctx, bgX, bgY, bgWidth, bgHeight, 4)
    ctx.fill()

    // текст
    ctx.fillStyle = 'white'
    ctx.fillText(name, p.x, bgY + bgHeight / 2)

    ctx.restore()
  }
}
