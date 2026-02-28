import type { world } from '@/engine'
import type { vec2 } from '@/engine'
import { getCursorTexture } from '@/engine/assets/textures'
import { drawRoundRect } from '@/engine/render/util'
import {Team} from "@/enums/teamKeys.ts";
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys.ts";
import {translate} from '@/i18n'

const FADE_DELAY = 20_000
const FADE_DURATION = 10_000

export class cursorlayer {
  private cursorTexture = getCursorTexture()
  private teamTitles: Record<Team, string>

  constructor() {
    const teams = [
      Team.ADMIN,
      Team.RED,
      Team.BLUE,
      Team.SPECTATOR,
    ]
    this.teamTitles = {} as Record<Team, string>;

    for (let team of teams) {
      if (team === Team.RED) {
        this.teamTitles[team] = window.ROOM_SETTINGS[ROOM_SETTING_KEYS.RED_TEAM_NAME] ?? translate('team.red');
      } else if (team === Team.BLUE) {
        this.teamTitles[team] = window.ROOM_SETTINGS[ROOM_SETTING_KEYS.BLUE_TEAM_NAME] ?? translate('team.blue');
      } else {
        this.teamTitles[team] = translate('team.' + team);
      }
    }
  }

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

      if (window.PLAYER.team === Team.ADMIN) {
        this.drawCursor(ctx, cam, cursor.pos, `${this.teamTitles[cursor.team]} - ${cursor.name}`, alpha)
      } else {
        this.drawCursor(ctx, cam, cursor.pos, cursor.name, alpha)
      }
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
