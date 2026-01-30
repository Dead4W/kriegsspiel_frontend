import type {world} from "@/engine/world/world.ts";
import type {vec2} from "@/engine/types.ts";

type Cam = {
  zoom: number
  worldToScreen(p: vec2): vec2
}

export class PaintLayer {
  private bufferCanvas?: OffscreenCanvas | HTMLCanvasElement
  private bufferCtx?: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
  private bufferW = 0
  private bufferH = 0
  private dirty = true
  private lastPaintVersion = -1
  private lastCamSig?: { x: number; y: number; zoom: number; vpW: number; vpH: number }

  private ensureBuffer(viewportW: number, viewportH: number) {
    const dpr = window.devicePixelRatio || 1
    const targetW = Math.floor(viewportW * dpr)
    const targetH = Math.floor(viewportH * dpr)

    if (!this.bufferCanvas || !this.bufferCtx || this.bufferW !== targetW || this.bufferH !== targetH) {
      this.bufferCanvas =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(targetW, targetH)
          : Object.assign(document.createElement('canvas'), { width: targetW, height: targetH })

      this.bufferCtx = this.bufferCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
      this.bufferW = targetW
      this.bufferH = targetH
      this.dirty = true
    }

    // Match main renderer coordinates (CSS px) by applying DPR transform.
    ;(this.bufferCtx as any).setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  draw(ctx: CanvasRenderingContext2D, w: world) {
    const cam = w.camera as unknown as Cam
    const strokes = w.paint.list()
    if (!strokes.length) return

    // Draw paint into its own buffer so eraser doesn't affect the map layer.
    const vpW = w.camera.viewport.x
    const vpH = w.camera.viewport.y
    this.ensureBuffer(vpW, vpH)
    const bctx = this.bufferCtx!

    const camSig = { x: w.camera.pos.x, y: w.camera.pos.y, zoom: w.camera.zoom, vpW, vpH }
    const paintVersion = w.paint.getVersion()

    const needRebuild =
      this.dirty ||
      this.lastPaintVersion !== paintVersion ||
      !this.lastCamSig ||
      this.lastCamSig.x !== camSig.x ||
      this.lastCamSig.y !== camSig.y ||
      this.lastCamSig.zoom !== camSig.zoom ||
      this.lastCamSig.vpW !== camSig.vpW ||
      this.lastCamSig.vpH !== camSig.vpH

    if (needRebuild) {
      bctx.save()
      bctx.clearRect(0, 0, vpW, vpH)
      bctx.lineCap = 'round'
      bctx.lineJoin = 'round'

      for (const s of strokes) {
        if (s.points.length < 2) continue

        const mode = s.mode ?? 'draw'
        bctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over'
        // For erasing, the RGB doesn't matter; alpha controls erase strength.
        bctx.strokeStyle = s.color
        bctx.lineWidth = Math.max(1, s.width * cam.zoom)

        bctx.beginPath()
        const first = cam.worldToScreen(s.points[0]!)
        bctx.moveTo(first.x, first.y)

        for (let i = 1; i < s.points.length; i++) {
          const p = cam.worldToScreen(s.points[i]!)
          bctx.lineTo(p.x, p.y)
        }

        bctx.stroke()
      }

      bctx.restore()

      this.lastPaintVersion = paintVersion
      this.lastCamSig = camSig
      this.dirty = false
    }

    // Composite the paint buffer over the already drawn map.
    // drawImage arguments are in CSS px because main ctx already has DPR transform.
    ctx.drawImage(this.bufferCanvas as any, 0, 0, vpW, vpH)
  }
}

