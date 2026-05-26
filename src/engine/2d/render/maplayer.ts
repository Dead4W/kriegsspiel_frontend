import type { world } from '@/engine/world/world'
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";
import { Team } from '@/enums/teamKeys.ts'
import { RoomGameStage } from '@/enums/roomStage.ts'
import { getActiveZoneRects, getTeamSpawnRects, type SpawnRect } from '@/game/planningSpawns'

type TeamSpawnZone = {
  team: Team.RED | Team.BLUE
  rect: SpawnRect
}

export class maplayer {
  private img: CanvasImageSource | null = null
  private fogMaskCanvas: HTMLCanvasElement | null = null

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

    this.drawActiveZones(ctx, w)
    this.drawPlanningSpawnZones(ctx, w)

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
      w.objectMapCanvas &&
      window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SHOW_OBJECT_MAP]
    ) {
      this.drawObjectMap(ctx, w)
    }

    // ===== DEBUG: HEIGHT MAP =====
    if (
      this.canRenderDebugMaps() &&
      w.heightMapCanvas &&
      window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SHOW_HEIGHT_MAP]
    ) {
      this.drawHeightMap(ctx, w)
    }
  }

  private drawPlanningSpawnZones(ctx: CanvasRenderingContext2D, w: world) {
    if (w.stage !== RoomGameStage.PLANNING) return

    const team = window.PLAYER.team
    if (team !== Team.ADMIN && team !== Team.RED && team !== Team.BLUE) return
    if (team !== Team.ADMIN && window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.HIDE_UNITS_LAYER]) return

    if (team === Team.ADMIN) {
      const zones = this.getAdminSpawnZones()
      if (!zones.length) return
      this.drawAdminSpawnZones(ctx, w, zones)
      return
    }

    const zones = this.getVisibleSpawnZones(team)
    if (!zones.length) return
    this.drawPlayerSpawnFog(ctx, w, zones, team)
  }

  private drawActiveZones(ctx: CanvasRenderingContext2D, w: world) {
    const zones = getActiveZoneRects()
    if (!zones.length) return

    const team = window.PLAYER.team
    if (team !== Team.ADMIN && team !== Team.RED && team !== Team.BLUE && team !== Team.SPECTATOR) return
    if (window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.HIDE_UNITS_LAYER]) return

    this.drawActiveFog(ctx, w, zones)
  }

  private drawActiveFog(
    ctx: CanvasRenderingContext2D,
    w: world,
    zones: SpawnRect[],
  ) {
    this.drawFogOutsideRects(ctx, w, zones, 'rgba(2, 6, 23, 0.35)')
  }

  private getAdminSpawnZones(): TeamSpawnZone[] {
    const redZones = getTeamSpawnRects(Team.RED).map((rect) => ({ team: Team.RED as const, rect }))
    const blueZones = getTeamSpawnRects(Team.BLUE).map((rect) => ({ team: Team.BLUE as const, rect }))
    return [...redZones, ...blueZones]
  }

  private getVisibleSpawnZones(team: Team): SpawnRect[] {
    if (team === Team.RED || team === Team.BLUE) {
      return getTeamSpawnRects(team)
    }
    return []
  }

  private drawAdminSpawnZones(
    ctx: CanvasRenderingContext2D,
    w: world,
    zones: TeamSpawnZone[],
  ) {
    const cam = w.camera
    ctx.save()
    ctx.scale(cam.zoom, cam.zoom)
    ctx.translate(-cam.pos.x, -cam.pos.y)
    ctx.lineWidth = 1 / Math.max(cam.zoom, 0.0001)

    for (const zone of zones) {
      const width = Math.max(0, zone.rect.to.x - zone.rect.from.x)
      const height = Math.max(0, zone.rect.to.y - zone.rect.from.y)
      if (width <= 0 || height <= 0) continue
      ctx.fillStyle = zone.team === Team.RED
        ? 'rgba(239, 68, 68, 0.28)'
        : 'rgba(59, 130, 246, 0.28)'
      ctx.strokeStyle = zone.team === Team.RED
        ? 'rgba(248, 113, 113, 0.75)'
        : 'rgba(96, 165, 250, 0.75)'
      ctx.fillRect(zone.rect.from.x, zone.rect.from.y, width, height)
      ctx.strokeRect(zone.rect.from.x, zone.rect.from.y, width, height)
    }

    ctx.restore()
  }

  private drawPlayerSpawnFog(
    ctx: CanvasRenderingContext2D,
    w: world,
    zones: SpawnRect[],
    team: Team.RED | Team.BLUE,
  ) {
    const spawnTint = team === Team.RED
      ? 'rgba(248, 113, 113, 0.08)'
      : 'rgba(96, 165, 250, 0.08)'
    this.drawFogOutsideRects(ctx, w, zones, 'rgba(2, 6, 23, 0.2)')

    const cam = w.camera
    ctx.save()
    ctx.fillStyle = spawnTint
    for (const zone of zones) {
      const from = cam.worldToScreen(zone.from)
      const to = cam.worldToScreen(zone.to)
      const left = Math.min(from.x, to.x)
      const top = Math.min(from.y, to.y)
      const width = Math.max(0, Math.abs(to.x - from.x))
      const height = Math.max(0, Math.abs(to.y - from.y))
      if (width <= 0 || height <= 0) continue
      ctx.fillRect(left, top, width, height)
    }
    ctx.restore()
  }

  private drawFogOutsideRects(
    ctx: CanvasRenderingContext2D,
    w: world,
    zones: SpawnRect[],
    fogColor: string,
  ) {
    const cam = w.camera
    const viewportW = Math.max(1, Math.floor(cam.viewport.x))
    const viewportH = Math.max(1, Math.floor(cam.viewport.y))

    if (!this.fogMaskCanvas || this.fogMaskCanvas.width !== viewportW || this.fogMaskCanvas.height !== viewportH) {
      this.fogMaskCanvas = document.createElement('canvas')
      this.fogMaskCanvas.width = viewportW
      this.fogMaskCanvas.height = viewportH
    }

    const maskCtx = this.fogMaskCanvas.getContext('2d')
    if (!maskCtx) return

    maskCtx.clearRect(0, 0, viewportW, viewportH)
    maskCtx.globalCompositeOperation = 'source-over'
    maskCtx.fillStyle = fogColor
    maskCtx.fillRect(0, 0, viewportW, viewportH)
    maskCtx.globalCompositeOperation = 'destination-out'
    maskCtx.fillStyle = 'rgba(0, 0, 0, 1)'

    for (const zone of zones) {
      const from = cam.worldToScreen(zone.from)
      const to = cam.worldToScreen(zone.to)
      const left = Math.min(from.x, to.x)
      const top = Math.min(from.y, to.y)
      const width = Math.max(0, Math.abs(to.x - from.x))
      const height = Math.max(0, Math.abs(to.y - from.y))
      if (width <= 0 || height <= 0) continue
      maskCtx.fillRect(left, top, width, height)
    }

    maskCtx.globalCompositeOperation = 'source-over'
    ctx.drawImage(this.fogMaskCanvas, 0, 0)
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

  private drawObjectMap(ctx: CanvasRenderingContext2D, w: world) {
    if (!w.objectMapCanvas) return

    const cam = w.camera

    ctx.save()
    ctx.scale(cam.zoom, cam.zoom)
    ctx.translate(-cam.pos.x, -cam.pos.y)
    ctx.globalAlpha = 0.7
    ctx.drawImage(w.objectMapCanvas, 0, 0)
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
