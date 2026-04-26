import type { world } from '../world/world'
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";
import { Team } from '@/enums/teamKeys.ts'

export class maplayer {
  private img: CanvasImageSource | null = null

  private canRenderDebugMaps() {
    return window.PLAYER.team === Team.ADMIN || window.PLAYER.team === Team.SPECTATOR
  }

  setImage(img: CanvasImageSource) {
    this.img = img
  }

  draw(ctx: CanvasRenderingContext2D, w: world) {
    if (!this.img) return

    const cam = w.camera
    const sx = cam.pos.x
    const sy = cam.pos.y
    const sw = cam.viewport.x / cam.zoom
    const sh = cam.viewport.y / cam.zoom

    // рисуем видимую часть карты (source rect -> dest rect)
    ctx.drawImage(
      this.img,
      sx, sy, sw, sh,
      0, 0, cam.viewport.x, cam.viewport.y
    )

    // ===== DEBUG: FOREST MAP =====
    if (
      this.canRenderDebugMaps() &&
      w.forestCanvas &&
      window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SHOW_FOREST_MAP]
    ) {
      this.drawForestMap(ctx, w)
    }

    // ===== DEBUG: FOREST MAP =====
    if (
      this.canRenderDebugMaps() &&
      w.forestCanvas &&
      window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SHOW_HEIGHT_MAP]
    ) {
      this.drawHeightMap(ctx, w)
    }
  }

  private drawForestMap(ctx: CanvasRenderingContext2D, w: world) {
    if (!w.forestCanvas) return

    const cam = w.camera

    ctx.save()

    // камера
    ctx.scale(cam.zoom, cam.zoom)
    ctx.translate(-cam.pos.x, -cam.pos.y)

    // просто рисуем карту леса
    ctx.drawImage(w.forestCanvas, 0, 0)

    ctx.restore()
  }

  private cacheVisualHeightCanvas?: OffscreenCanvas | HTMLCanvasElement;
  private getHeightDebugCanvas(
    srcCanvas: OffscreenCanvas | HTMLCanvasElement
  ): OffscreenCanvas | HTMLCanvasElement {
    if (this.cacheVisualHeightCanvas) {
      return this.cacheVisualHeightCanvas;
    }

    const w = srcCanvas.width
    const h = srcCanvas.height

    const srcCtx = srcCanvas.getContext("2d")!
    const srcImg = (srcCtx as CanvasRenderingContext2D).getImageData(0, 0, w, h)

    const data = srcImg.data

    // -------------------------
    // 1. найти min max
    // -------------------------

    let minH = Infinity
    let maxH = -Infinity

    for (let i = 0; i < data.length; i += 4) {

      const a = data[i + 3]!
      if (a < 10) continue

      const height =
        data[i]! +
        data[i + 1]! +
        data[i + 2]!

      if (height < minH) minH = height
      if (height > maxH) maxH = height
    }

    const range = Math.max(1, maxH - minH)

    console.log("Height range:", minH, maxH)

    // -------------------------
    // 2. создаём debug canvas
    // -------------------------

    const outCanvas = document.createElement("canvas")

    outCanvas.width = w
    outCanvas.height = h

    const outCtx = outCanvas.getContext("2d")!

    const outImg = outCtx.createImageData(w, h)
    const out = outImg.data

    // -------------------------
    // 3. покрасить
    // -------------------------

    for (let i = 0; i < data.length; i += 4) {

      const a = data[i + 3]!

      if (a < 10) {
        out[i + 3] = 0
        continue
      }

      const height =
        data[i]! +
        data[i + 1]! +
        data[i + 2]!

      // normalize 0..1
      const t = (height - minH) / range

      let r = 0
      let g = 0
      let b = 0

      // -------- gradient --------

      if (t < 0.5) {

        // blue -> green

        const k = t * 2

        r = 0
        g = 255 * k
        b = 255 * (1 - k)

      } else {

        // green -> red

        const k = (t - 0.5) * 2

        r = 255 * k
        g = 255 * (1 - k)
        b = 0
      }

      out[i] = r
      out[i + 1] = g
      out[i + 2] = b
      out[i + 3] = 255
    }

    outCtx.putImageData(outImg, 0, 0)

    return this.cacheVisualHeightCanvas = outCanvas
  }

  private drawHeightMap(ctx: CanvasRenderingContext2D, w: world) {
    if (!w.heightMapCanvas) return

    const cam = w.camera

    ctx.save()

    // камера
    ctx.scale(cam.zoom, cam.zoom)
    ctx.translate(-cam.pos.x, -cam.pos.y)

    // прозрачность 50%
    ctx.globalAlpha = 0.5

    // contrast blending
    ctx.globalCompositeOperation = "hard-light"

    // рисуем карту
    ctx.drawImage(this.getHeightDebugCanvas(w.heightMapCanvas), 0, 0)

    ctx.restore()
  }

}
