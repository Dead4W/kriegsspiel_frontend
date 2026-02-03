import type {world} from '../world/world'
import {drawRoundRect, getTeamColor} from '@/engine/render/util.ts'
import {CLIENT_SETTING_KEYS} from '@/enums/clientSettingsKeys'
import {translate} from '@/i18n'
import {drawUnitVision} from "@/engine/render/unitlayer/visionlayer.ts";
import {getUnitTexture} from "@/engine/assets/textures.ts";
import {drawAttackWaveIcons} from "@/engine/render/canvasUtil.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import type {MoveCommandState} from "@/engine/units/commands/moveCommand.ts";
import {AttackCommand, type AttackCommandState} from "@/engine/units/commands/attackCommand.ts";
import {unitType, type vec2} from "@/engine";
import {
  type UnitEnvironmentState,
  UnitEnvironmentStateIcon
} from "@/engine/units/enums/UnitStates.ts";
import {debugPerformance} from "@/engine/debugPerformance.ts";
import {UnitAbilityType} from "@/engine/units/modifiers/UnitAbilityModifiers.ts";
import {computeInaccuracyRadius} from "@/engine/units/modifiers/UnitInaccuracyModifier.ts";
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys.ts";

type MoveOrderRange = {
  min: number
  max: number
}

function hpGradientColor(hpRatio: number) {
  const clamped = Math.max(0, Math.min(1, hpRatio))
  const percent = Math.round(clamped * 100)

  // <= 5% — всегда красный
  if (percent <= 5) {
    return '#ef4444'
  }

  const t = clamped

  const r = Math.round(239 + (34 - 239) * t)
  const g = Math.round(68 + (197 - 68) * t)
  const b = Math.round(68 + (94 - 68) * t)

  return `rgb(${r}, ${g}, ${b})`
}

export class unitlayer {
  static readonly BASE_UNIT_W = 30
  static readonly BASE_UNIT_H = 15

  unitTypesLabel: Map<unitType, string> = new Map()

  private move_orders: Record<string, MoveOrderRange> = {}

  private unitScale: number = 1

  private inaccuracyRenderedPoints: string[] = [];

  constructor() {
    for (const type of Object.values(unitType)) {
      this.unitTypesLabel.set(type, translate(`unit.${type}`))
    }
  }

  // =============================
  // PUBLIC DRAW ENTRY
  // =============================

  draw(ctx: CanvasRenderingContext2D, w: world) {
    this.inaccuracyRenderedPoints = [];

    const cam = w.camera
    const settings = window.CLIENT_SETTINGS
    this.unitScale = settings[CLIENT_SETTING_KEYS.SIZE_UNIT]

    this.drawVision(ctx, w, settings)
    this.updateMoveOrders()

    const units = w.units
      .list()
      .sort((a, b) => (a.lastSelected ?? 0) - (b.lastSelected ?? 0))

    for (const unit of units) {
      this.drawUnit(ctx, cam, unit, settings)
    }
  }

  // =============================
  // VISION
  // =============================

  private drawVision(
    ctx: CanvasRenderingContext2D,
    w: world,
    settings: typeof window.CLIENT_SETTINGS
  ) {
    if (
      settings[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION] &&
      !settings[CLIENT_SETTING_KEYS.SHOW_HEIGHT_MAP]
    ) {
      debugPerformance('drawUnitVision', () => {
        drawUnitVision(ctx, w, settings)
      })
    }
  }

  // =============================
  // UNIT DRAW
  // =============================

  private drawUnit(
    ctx: CanvasRenderingContext2D,
    cam: world['camera'],
    unit: BaseUnit,
    settings: typeof window.CLIENT_SETTINGS
  ) {
    debugPerformance('drawUnit', () => {
      const unitOpacity = unit.alive
        ? settings[CLIENT_SETTING_KEYS.OPACITY_UNIT] ?? 1
        : 0.3

      const p = cam.worldToScreen(unit.pos)
      const futureP = unit.futurePos ? cam.worldToScreen(unit.futurePos) : null

      const { r, g, b } = getTeamColor(unit.team)
      ctx.fillStyle = `rgba(${r},${g},${b},${unitOpacity})`

      debugPerformance('drawCommands', () => {
        ctx.save()
        this.drawCommands(ctx, cam, unit)
        ctx.restore()
        ctx.closePath()
      })


      const wUnit = unitlayer.BASE_UNIT_W * cam.zoom * this.unitScale
      const hUnit = unitlayer.BASE_UNIT_H * cam.zoom * this.unitScale

      debugPerformance('drawUnitBody', () => {
        ctx.save()
        this.drawUnitBody(ctx, cam, unit, p, wUnit, hUnit, unitOpacity)
        ctx.restore()
        ctx.closePath()
      })
      if (unit.isSelected() && !unit.isFutureSelected()) {
        debugPerformance('drawSelection', () => {
          ctx.save()
          this.drawSelection(ctx, cam, unit, p, wUnit, hUnit)
          ctx.restore()
          ctx.closePath()
        })
      }
      if (futureP) {
        debugPerformance('drawFutureUnitBody', () => {
          ctx.save()
          this.drawUnitBody(ctx, cam, unit, futureP, wUnit, hUnit, unitOpacity * 0.5)
          ctx.restore()
          ctx.closePath()
        })
        if (unit.isSelected() && unit.isFutureSelected()) {
          debugPerformance('drawSelection', () => {
            ctx.save()
            this.drawSelection(ctx, cam, unit, futureP, wUnit, hUnit)
            ctx.restore()
            ctx.closePath()
          })
        }
      }
      debugPerformance('drawHpAmmo', () => {
        ctx.save()
        this.drawHpAmmo(ctx, cam, unit, p, wUnit, hUnit, settings)
        ctx.restore()
        ctx.closePath()
      })
      debugPerformance('drawModifiers', () => {
        ctx.save()
        this.drawModifiers(ctx, cam, unit, p, wUnit, hUnit, settings)
        ctx.restore()
        ctx.closePath()
      })
      debugPerformance('drawLabel', () => {
        ctx.save()
        this.drawLabel(ctx, cam, unit, p, wUnit, hUnit, settings)
        ctx.restore()
        ctx.closePath()
      })
    })
  }

  // =============================
  // BODY / TEXTURE
  // =============================

  private drawUnitBody(
    ctx: CanvasRenderingContext2D,
    cam: world['camera'],
    unit: BaseUnit,
    p: vec2,
    w: number,
    h: number,
    opacity: number
  ) {
    ctx.globalAlpha = opacity

    if (unit.type === unitType.MESSENGER) {
      const radius = Math.min(w, h) / 1.5
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    } else {
      ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h)

      const texture = unit.type ? getUnitTexture(unit.type) : null
      if (!texture || !texture.complete || texture.naturalWidth === 0) return
      ctx.drawImage(texture, p.x - w / 2, p.y - h / 2, w, h)
      ctx.strokeStyle = 'black'
      ctx.lineWidth = 1 * cam.zoom

      ctx.strokeRect(
        p.x - w / 2,
        p.y - h / 2,
        w,
        h
      )
    }

    ctx.globalAlpha = 1
  }

  // =============================
  // COMMANDS
  // =============================

  private drawCommands(
    ctx: CanvasRenderingContext2D,
    cam: world['camera'],
    unit: BaseUnit
  ) {
    const commands = unit.getCommands()
    if (!commands.length) return

    ctx.globalAlpha = 0.8
    const { r, g, b } = getTeamColor(unit.team)
    const color = `rgba(${r},${g},${b},1)`

    let from = unit.pos

    for (const cmd of commands) {
      switch (cmd.type) {
        case UnitCommandTypes.Move: {
          const state = cmd.getState().state as MoveCommandState
          const a = cam.worldToScreen(from)
          const b = cam.worldToScreen(state.target)

          debugPerformance('drawMoveLine', () => {
            ctx.save()
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.strokeStyle = color
            ctx.lineWidth = 6 * cam.zoom
            ctx.setLineDash([6 * cam.zoom, 6 * cam.zoom])
            ctx.lineDashOffset = -(performance.now() * cam.zoom * 0.01)

            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
            ctx.restore()
          })

          from = state.target
          break
        }

        case UnitCommandTypes.Attack: {
          const command = cmd as AttackCommand
          const cmdState: AttackCommandState = cmd.getState().state as AttackCommandState;
          if (
            cmdState.abilities.includes(UnitAbilityType.INACCURACY_FIRE)
            && cmdState.inaccuracyPoint
          ) {
            drawAttackWaveIcons(
              ctx,
              unit.pos,
              cmdState.inaccuracyPoint,
              color,
              cam.zoom
            )

            const inaccuracyPointKey = `${cmdState.inaccuracyPoint.x.toFixed(1)}_${cmdState.inaccuracyPoint.y.toFixed(1)}`
            if (!this.inaccuracyRenderedPoints.includes(inaccuracyPointKey)) {
              ctx.fillStyle = 'rgba(168,85,247,0.45)'
              ctx.strokeStyle = 'black'
              ctx.lineWidth = 1 * cam.zoom

              const radiusMeters = computeInaccuracyRadius(unit, cmdState.inaccuracyPoint);
              const radiusPixels = radiusMeters / window.ROOM_WORLD.map.metersPerPixel;

              const {x,y} = cam.worldToScreen(cmdState.inaccuracyPoint)

              ctx.beginPath()
              ctx.arc(x, y, radiusPixels * cam.zoom, 0, Math.PI * 2)
              ctx.fill()
              ctx.stroke()
              this.inaccuracyRenderedPoints.push(inaccuracyPointKey);
            }
          } else {
            const targets = command.getPriorityTargets(unit)
            for (const target of targets) {
              debugPerformance('drawAttackWaveIcons', () => {
                drawAttackWaveIcons(
                  ctx,
                  unit.pos,
                  target.pos,
                  color,
                  cam.zoom
                )
              })
            }
          }
          break
        }
      }
    }

    ctx.globalAlpha = 1
  }

  // =============================
  // MOVE ORDER INDEX
  // =============================

  private updateMoveOrders() {
    return debugPerformance('updateMoveOrders', () => {
      const orders: Record<string, MoveOrderRange> = {}

      for (const u of window.ROOM_WORLD.units.list()) {
        for (const cmd of u.getCommands()) {
          if (cmd.type !== UnitCommandTypes.Move) continue

          const state = cmd.getState().state as MoveCommandState
          const id = state.uniqueId

          const entry = orders[id]
          if (!entry) {
            orders[id] = { min: state.orderIndex, max: state.orderIndex }
          } else {
            entry.min = Math.min(entry.min, state.orderIndex)
            entry.max = Math.max(entry.max, state.orderIndex)
          }
        }
      }

      this.move_orders = orders
    })
  }

  // =============================
  // UI PARTS (HP / LABELS / ICONS)
  // =============================

  private drawHpAmmo(
    ctx: CanvasRenderingContext2D,
    cam: world['camera'],
    unit: BaseUnit,
    p: { x: number; y: number },
    w: number,
    h: number,
    settings: typeof window.CLIENT_SETTINGS
  ) {
    if (
      !settings[CLIENT_SETTING_KEYS.SHOW_HP_UNIT_ON_MAP] ||
      unit.hp == null
    )
      return

    const hpRatio = unit.hp / unit.stats.maxHp
    const barH = 4 * cam.zoom * this.unitScale
    const y = p.y + h / 2 + 2 * cam.zoom * this.unitScale

    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(p.x - w / 2, y, w, barH)

    ctx.fillStyle = hpGradientColor(hpRatio)
    ctx.fillRect(p.x - w / 2, y, w * hpRatio, barH)

    if (window.ROOM_SETTINGS[ROOM_SETTING_KEYS.LIMITED_AMMO]) {
      const ammoY = y + barH
      const ammoRatio = unit.ammo / unit.stats.ammoMax


      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(p.x - w / 2, ammoY, w, barH)

      ctx.fillStyle = 'rgb(255,106,0)'
      ctx.fillRect(p.x - w / 2, ammoY, w * ammoRatio, barH)
    }
  }

  private drawModifiers(
    ctx: CanvasRenderingContext2D,
    cam: world['camera'],
    unit: BaseUnit,
    p: { x: number; y: number },
    w: number,
    h: number,
    settings: typeof window.CLIENT_SETTINGS
  ) {
    if (!settings[CLIENT_SETTING_KEYS.SHOW_UNIT_MODIFICATORS]) return

    const states: UnitEnvironmentState[] = unit.envState

    let icons: string[] = [];

    if (unit.directView) {
      icons.push('👁️')
    }

    if (unit.isTimeout) {
      icons.push('🏳️')
    }

    const envIcons = states
      .map(s => UnitEnvironmentStateIcon[s])
      .filter(Boolean)

    icons = [...icons, ...envIcons];

    if (!icons.length) return

    const text = icons.join(' ')
    ctx.font = `${14 * cam.zoom * this.unitScale}px system-ui`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const metrics = ctx.measureText(text)
    const bgW = metrics.width + 12 * cam.zoom * this.unitScale
    const bgH = 20 * cam.zoom * this.unitScale
    const y = p.y - h / 2 - bgH - 25 * cam.zoom * this.unitScale

    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(
      p.x - bgW / 2,
      y,
      bgW,
      bgH
    )

    ctx.fillStyle = 'white'
    ctx.fillText(text, p.x, y + bgH / 2)
  }

  private drawLabel(
    ctx: CanvasRenderingContext2D,
    cam: world['camera'],
    unit: BaseUnit,
    p: { x: number; y: number },
    w: number,
    h: number,
    settings: typeof window.CLIENT_SETTINGS
  ) {
    if (!settings[CLIENT_SETTING_KEYS.SHOW_UNIT_LABELS] || !unit.label) return

    let text = unit.label
    if (settings[CLIENT_SETTING_KEYS.SHOW_UNIT_LABEL_TYPE]) {
      text += ` (${this.unitTypesLabel.get(unit.type)!})`
    }

    ctx.font = `${12 * cam.zoom * this.unitScale}px system-ui`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const metrics = ctx.measureText(text)
    const bgW = metrics.width + 12 * cam.zoom * this.unitScale
    const bgH = 18 * cam.zoom * this.unitScale
    const y = p.y - h / 2 - bgH - 6 * cam.zoom * this.unitScale

    ctx.fillStyle = unit.isSelected() && !unit.isFutureSelected()
      ? 'rgba(74,222,128,0.55)'
      : 'rgba(0,0,0,0.55)'

    debugPerformance('fillRect', () => {
      ctx.fillRect(
        p.x - bgW / 2,
        y,
        bgW,
        bgH
      )
    })

    ctx.fillStyle = 'white'
    debugPerformance('fillText', () => {
      ctx.fillText(text, p.x, y + bgH / 2)
    })
  }

  private drawSelection(
    ctx: CanvasRenderingContext2D,
    cam: world['camera'],
    unit: BaseUnit,
    p: { x: number; y: number },
    w: number,
    h: number
  ) {
    if (!unit.isSelected()) return

    const pad = 2 * cam.zoom

    ctx.strokeStyle = '#4ade80'
    ctx.lineWidth = 3 * cam.zoom

    if (unit.type === unitType.MESSENGER) {
      const radius = Math.min(w, h) / 1.5 + pad

      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.strokeRect(
        p.x - w / 2 - pad,
        p.y - h / 2 - pad,
        w + pad * 2,
        h + pad * 2
      )
    }
  }
}
