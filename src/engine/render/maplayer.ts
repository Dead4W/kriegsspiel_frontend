import type { world } from '../world/world'
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";

export class maplayer {
  private img: CanvasImageSource | null = null

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
      w.forestCanvas &&
      window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SHOW_FOREST_MAP]
    ) {
      this.drawForestMap(ctx, w)
    }

    // ===== DEBUG: FOREST MAP =====
    if (
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

  private drawHeightMap(ctx: CanvasRenderingContext2D, w: world) {
    if (!w.heightMapCanvas) return

    const cam = w.camera

    ctx.save()

    // камера
    ctx.scale(cam.zoom, cam.zoom)
    ctx.translate(-cam.pos.x, -cam.pos.y)

    // прозрачность 50%
    ctx.globalAlpha = 0.5

    // рисуем карту
    ctx.drawImage(w.heightMapCanvas, 0, 0)

    ctx.restore()
  }

}
