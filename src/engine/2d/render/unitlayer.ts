import type {world} from '@/engine'
import {unitType, type vec2} from "@/engine";
import {getTeamColor} from '@/engine/2d/render/util.ts'
import {CLIENT_SETTING_KEYS} from '@/enums/clientSettingsKeys'
import {translate} from '@/i18n'
import {
  drawUnitVision,
  getUnitRenderDetailMinZoom,
} from "@/engine/2d/render/unitlayer/visionlayer.ts";
import {getUnitTexture} from "@/engine/assets/textures.ts";
import {drawAttackWaveIcons} from "@/engine/2d/render/canvasUtil.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import type {MoveCommandState} from "@/engine/units/commands/moveCommand.ts";
import {AttackCommand, type AttackCommandState} from "@/engine/units/commands/attackCommand.ts";
import {debugPerformance} from "@/engine/debugPerformance.ts";
import {computeInaccuracyRadius} from "@/engine/units/modifiers/UnitInaccuracyModifier.ts";
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys.ts";
import {getInaccuracyAbility} from "@/engine/resourcePack/abilities.ts";
import {getEnvironmentIcon} from "@/engine/resourcePack/environment.ts";
import {getFormationIcon} from "@/engine/resourcePack/formations.ts";
import {getUnitNumberParam, getUnitStringParam} from "@/engine/resourcePack/units.ts";
import type {DirectViewObjectState} from "@/engine/types/directViewObjects.ts";
import {getFatigueConfig} from "@/engine/resourcePack/fatigue.ts";
import {isScreenPointVisible} from "@/engine/2d/render/culling.ts";
import {formatHpLostShort} from "@/engine/units/hpHistory.ts";

type InaccuracyCircle = {
  x: number
  y: number
  radius: number
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
  /** Ниже этого масштаба текст и полосы не читаются и скрываются для невыбранных юнитов. */
  /** Высота подписей/иконок над юнитом и полос под ним, в базовых пикселях. */
  static readonly LABELS_SCREEN_MARGIN = 90

  unitTypesLabel: Map<unitType, string> = new Map()

  private unitScale: number = 1

  private inaccuracyCirclesByPoint: Map<string, InaccuracyCircle[]> = new Map();

  constructor() {
    for (const type of Object.values(unitType)) {
      this.unitTypesLabel.set(type, translate(`unit.${type}`))
    }
  }

  /** Размер юнита в координатах карты: базовый размер задан в метрах. */
  static getWorldSize(
    type: unitType,
    metersPerPixel: number,
    scale = 1
  ): { width: number; height: number } {
    const pixelScale = Math.max(0.0001, Number(metersPerPixel) || 1) / 2
    const wMult = getUnitNumberParam(type, 'renderWidthMult') ?? 1
    const hMult = getUnitNumberParam(type, 'renderHeightMult') ?? 1

    return {
      width: unitlayer.BASE_UNIT_W * scale * wMult / pixelScale,
      height: unitlayer.BASE_UNIT_H * scale * hMult / pixelScale,
    }
  }

  /** Масштаб экранных элементов, привязанных к размеру юнита. */
  private getUiScale(): number {
    const metersPerPixel = Math.max(
      0.0001,
      Number(window.ROOM_WORLD.map.metersPerPixel) || 1
    )
    return this.unitScale / metersPerPixel * 2
  }

  // =============================
  // PUBLIC DRAW ENTRY
  // =============================

  draw(ctx: CanvasRenderingContext2D, w: world) {
    if (window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.HIDE_UNITS_LAYER]) {
      return
    }

    this.inaccuracyCirclesByPoint.clear();

    const cam = w.camera
    const settings = window.CLIENT_SETTINGS
    this.unitScale = settings[CLIENT_SETTING_KEYS.SIZE_UNIT]

    this.drawVision(ctx, w, settings)
    this.drawDirectViewObjects(ctx, w, settings)

    const units = w.units
      .list()
      // Draw from top to bottom so units lower on the map overlap units above them.
      .sort((a, b) => a.pos.y - b.pos.y)

    if (settings[CLIENT_SETTING_KEYS.SHOW_UNIT_COMMANDS]) {
      const onlySelected =
        settings[CLIENT_SETTING_KEYS.SHOW_UNIT_COMMANDS_ONLY_SELECTED]
      for (const unit of units) {
        if (onlySelected && !unit.isSelected()) continue
        debugPerformance('drawCommands', () => {
          ctx.save()
          this.drawCommands(ctx, cam, unit, settings)
          ctx.restore()
          ctx.closePath()
        })
      }
    }

    this.drawInaccuracyCircles(ctx, cam, settings)

    for (const unit of units) {
      this.drawUnit(ctx, cam, unit, w.map.metersPerPixel, settings)
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
      settings[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION]
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
    metersPerPixel: number,
    settings: typeof window.CLIENT_SETTINGS
  ) {
    debugPerformance('drawUnit', () => {
      const unitOpacity = unit.alive
        ? settings[CLIENT_SETTING_KEYS.OPACITY_UNIT] ?? 1
        : 0.3

      const p = cam.worldToScreen(unit.pos)
      const futureP = unit.futurePos ? cam.worldToScreen(unit.futurePos) : null

      const size = unitlayer.getWorldSize(
        unit.type,
        metersPerPixel,
        this.unitScale
      )
      const wUnit = size.width * cam.zoom
      const hUnit = size.height * cam.zoom

      // Выбранный юнит сохраняет подробности на любом масштабе.
      const showDetails =
        cam.zoom >= getUnitRenderDetailMinZoom(metersPerPixel) || unit.isSelected()

      // Запас покрывает подписи и модификаторы над юнитом и полосы HP под ним.
      const cullMargin =
        Math.max(wUnit, hUnit) +
        (showDetails
          ? unitlayer.LABELS_SCREEN_MARGIN * cam.zoom * this.getUiScale()
          : 0)
      const visible =
        isScreenPointVisible(p.x, p.y, cam, cullMargin) ||
        (futureP != null && isScreenPointVisible(futureP.x, futureP.y, cam, cullMargin))
      if (!visible) return

      const futureAngle = futureP ? this.getFutureAngle(unit) : unit.angle

      const { r, g, b } = getTeamColor(unit.team)
      ctx.fillStyle = `rgba(${r},${g},${b},${unitOpacity})`

      debugPerformance('drawUnitBody', () => {
        ctx.save()
        this.drawUnitBody(ctx, cam, unit, p, wUnit, hUnit, unitOpacity, unit.angle)
        ctx.restore()
        ctx.closePath()
      })
      if (unit.isSelected() && !unit.isFutureSelected()) {
        debugPerformance('drawSelection', () => {
          ctx.save()
          this.drawSelection(ctx, cam, unit, p, wUnit, hUnit, unit.angle)
          ctx.restore()
          ctx.closePath()
        })
      }
      if (futureP) {
        debugPerformance('drawFutureUnitBody', () => {
          ctx.save()
          this.drawUnitBody(ctx, cam, unit, futureP, wUnit, hUnit, unitOpacity * 0.5, futureAngle)
          ctx.restore()
          ctx.closePath()
        })
        if (unit.isSelected() && unit.isFutureSelected()) {
          debugPerformance('drawSelection', () => {
            ctx.save()
            this.drawSelection(ctx, cam, unit, futureP, wUnit, hUnit, futureAngle)
            ctx.restore()
            ctx.closePath()
          })
        }
      }

      const showHpAmmo =
        showDetails &&
        settings[CLIENT_SETTING_KEYS.SHOW_HP_UNIT_ON_MAP] &&
        unit.hp != null
      const showModifiers =
        showDetails &&
        settings[CLIENT_SETTING_KEYS.SHOW_UNIT_MODIFICATORS]
      const showLabel =
        showDetails &&
        settings[CLIENT_SETTING_KEYS.SHOW_UNIT_LABELS] &&
        Boolean(unit.label)
      const hpLostLabel = showDetails
        ? formatHpLostShort(unit.getDisplayedHpLost5min())
        : null

      if (showHpAmmo || showModifiers || showLabel || hpLostLabel) {
        ctx.save()

        if (showHpAmmo) {
          debugPerformance('drawHpAmmo', () => {
            this.drawHpAmmo(ctx, cam, unit, p, wUnit, hUnit, settings)
          })
        }
        if (showModifiers) {
          debugPerformance('drawModifiers', () => {
            this.drawModifiers(ctx, cam, unit, p, wUnit, hUnit, settings)
          })
        }
        if (showLabel) {
          debugPerformance('drawLabel', () => {
            this.drawLabel(ctx, cam, unit, p, wUnit, hUnit, settings)
          })
        }
        if (hpLostLabel) {
          debugPerformance('drawHpLost', () => {
            this.drawHpLost(ctx, cam, p, wUnit, hUnit, hpLostLabel, showLabel, showModifiers)
          })
        }

        ctx.restore()
      }
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
    opacity: number,
    angle: number
  ) {
    ctx.globalAlpha = opacity

    ctx.translate(p.x, p.y)
    ctx.rotate(angle)
    ctx.translate(-w / 2, -h / 2)

    ctx.strokeStyle = 'black'
    ctx.lineWidth = 1 * cam.zoom
    ctx.setLineDash([])
    ctx.lineDashOffset = 0

    if (unit.type === unitType.MESSENGER) {
      const radius = Math.min(w, h) / 1.5
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    } else {
      ctx.fillRect(0, 0, w, h)

      const texture = unit.type ? getUnitTexture(unit.type) : null
      if (texture && texture.complete && texture.naturalWidth !== 0) {
        ctx.drawImage(texture, 0, 0, w, h)
      } else {
        const icon = getUnitStringParam(unit.type, 'renderIcon')
        if (icon) {
          ctx.save()
          ctx.fillStyle = 'rgba(255,255,255,0.92)'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const fontSize = Math.max(8, Math.min(w, h) * 0.75)
          ctx.font = `600 ${fontSize}px system-ui`
          ctx.fillText(icon, w / 2, h / 2 + fontSize * 0.03)
          ctx.restore()
        }
      }

      ctx.strokeRect(0, 0, w, h)
    }

    ctx.globalAlpha = 1
  }

  // =============================
  // COMMANDS
  // =============================

  private drawCommands(
    ctx: CanvasRenderingContext2D,
    cam: world['camera'],
    unit: BaseUnit,
    settings: typeof window.CLIENT_SETTINGS
  ) {
    if (!settings[CLIENT_SETTING_KEYS.SHOW_UNIT_COMMANDS]) return
    if (
      settings[CLIENT_SETTING_KEYS.SHOW_UNIT_COMMANDS_ONLY_SELECTED]
      && !unit.isSelected()
    ) {
      return
    }

    const commands = unit.getCommands()
    if (!commands.length) return

    ctx.globalAlpha = settings[CLIENT_SETTING_KEYS.OPACITY_COMMANDS] ?? 0.8
    const { r, g, b } = getTeamColor(unit.team)
    const color = `rgba(${r},${g},${b},1)`

    let from = unit.pos
    let hasPendingMovePath = false

    const flushMovePath = () => {
      if (!hasPendingMovePath) return

      debugPerformance('drawMoveLine', () => {
        ctx.save()
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = color
        ctx.lineWidth = 6 * cam.zoom
        ctx.setLineDash([6 * cam.zoom, 6 * cam.zoom])
        ctx.lineDashOffset = -(performance.now() * cam.zoom * 0.01)
        ctx.stroke()
        ctx.restore()
      })

      hasPendingMovePath = false
    }

    for (const cmd of commands) {
      if (cmd.type !== UnitCommandTypes.Move) {
        flushMovePath()
      }
      
      switch (cmd.type) {
        case UnitCommandTypes.Move: {
          const state = cmd.getState().state as MoveCommandState
          const a = cam.worldToScreen(from)
          const b = cam.worldToScreen(state.target)
          if (!hasPendingMovePath) {
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            hasPendingMovePath = true
          }
          ctx.lineTo(b.x, b.y)

          from = state.target
          break
        }

        case UnitCommandTypes.Attack: {
          const command = cmd as AttackCommand
          const cmdState: AttackCommandState = cmd.getState().state as AttackCommandState;
          const inaccuracyAbility =
            cmdState.inaccuracyPoint ? getInaccuracyAbility(cmdState.abilities) : null
          if (
            inaccuracyAbility
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
            const radiusMeters =
              computeInaccuracyRadius(unit, cmdState.inaccuracyPoint)
              * (cmdState.radiusModifier ?? 1)
              * inaccuracyAbility.radiusMult;
            const radiusPixels = radiusMeters / window.ROOM_WORLD.map.metersPerPixel;
            const {x, y} = cam.worldToScreen(cmdState.inaccuracyPoint)
            this.collectInaccuracyCircle(inaccuracyPointKey, {
              x,
              y,
              radius: radiusPixels * cam.zoom,
            })
          } else {
            const targets = command.getPriorityTargets(unit)
            if (targets.length === 0 && cmdState.directViewTargetPoint) {
              debugPerformance('drawAttackWaveIcons', () => {
                drawAttackWaveIcons(
                  ctx,
                  unit.pos,
                  cmdState.directViewTargetPoint!,
                  color,
                  cam.zoom
                )
              })
            }
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
    flushMovePath()

    ctx.globalAlpha = 1
  }

  private drawDirectViewObjects(
    ctx: CanvasRenderingContext2D,
    w: world,
    settings: typeof window.CLIENT_SETTINGS
  ) {
    if (!settings[CLIENT_SETTING_KEYS.SHOW_UNIT_COMMANDS]) return

    const cam = w.camera
    const objects: DirectViewObjectState[] = w.directViewObjects.value
    const commandOpacity = settings[CLIENT_SETTING_KEYS.OPACITY_COMMANDS] ?? 0.8
    for (const object of objects) {
      if (object.type === 'attack_line') {
        const { r, g, b } = getTeamColor(object.team)
        ctx.save()
        ctx.globalAlpha = commandOpacity
        drawAttackWaveIcons(
          ctx,
          object.data.from,
          object.data.to,
          `rgba(${r},${g},${b},1)`,
          cam.zoom
        )
        ctx.restore()
        continue
      }

      if (object.type !== 'inaccuracy') continue

      const inaccuracyPointKey =
        `${object.data.point.x.toFixed(1)}_${object.data.point.y.toFixed(1)}`

      const radiusPixels = object.data.radiusMeters / window.ROOM_WORLD.map.metersPerPixel
      const {x, y} = cam.worldToScreen(object.data.point)

      this.collectInaccuracyCircle(inaccuracyPointKey, {
        x,
        y,
        radius: radiusPixels * cam.zoom,
      })
    }
  }

  private collectInaccuracyCircle(pointKey: string, circle: InaccuracyCircle) {
    const circles = this.inaccuracyCirclesByPoint.get(pointKey)
    if (circles) {
      circles.push(circle)
      return
    }
    this.inaccuracyCirclesByPoint.set(pointKey, [circle])
  }

  private drawInaccuracyCircles(
    ctx: CanvasRenderingContext2D,
    cam: world['camera'],
    settings: typeof window.CLIENT_SETTINGS
  ) {
    if (this.inaccuracyCirclesByPoint.size === 0) return

    ctx.save()
    ctx.globalAlpha = settings[CLIENT_SETTING_KEYS.OPACITY_COMMANDS] ?? 0.8
    ctx.strokeStyle = 'black'
    ctx.lineWidth = 1 * cam.zoom

    for (const circlesAtPoint of this.inaccuracyCirclesByPoint.values()) {
      if (!circlesAtPoint.length) continue

      const sorted = [...circlesAtPoint].sort((a, b) => b.radius - a.radius)
      const [largestCircle, ...otherCircles] = sorted
      if (!largestCircle) continue

      ctx.fillStyle = 'rgba(168,85,247,0.45)'
      ctx.beginPath()
      ctx.arc(largestCircle.x, largestCircle.y, largestCircle.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      for (const circle of otherCircles) {
        ctx.beginPath()
        ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    ctx.restore()
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
    const uiScale = this.getUiScale()
    const barH = 4 * cam.zoom * uiScale
    const y = p.y + h / 2 + 2 * cam.zoom * uiScale
    const lostRatio = Math.max(0, unit.getDisplayedHpLost5min() / unit.stats.maxHp)

    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(p.x - w / 2, y, w, barH)

    if (lostRatio > 0) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.45)'
      ctx.fillRect(p.x - w / 2, y, w * Math.min(1, hpRatio + lostRatio), barH)
    }

    ctx.fillStyle = hpGradientColor(hpRatio)
    ctx.fillRect(p.x - w / 2, y, w * hpRatio, barH)

    let nextBarY = y + barH
    if (window.ROOM_SETTINGS[ROOM_SETTING_KEYS.LIMITED_AMMO]) {
      const ammoY = nextBarY
      const ammoRatio = unit.ammo / unit.stats.ammoMax


      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(p.x - w / 2, ammoY, w, barH)

      ctx.fillStyle = 'rgb(255,106,0)'
      ctx.fillRect(p.x - w / 2, ammoY, w * ammoRatio, barH)
      nextBarY += barH
    }

    if (window.ROOM_SETTINGS[ROOM_SETTING_KEYS.FATIGUE]) {
      const fatigueY = nextBarY
      const fatigueRatio = Math.max(0, Math.min(1, unit.fatigue / getFatigueConfig().max))

      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(p.x - w / 2, fatigueY, w, barH)

      ctx.fillStyle = '#ef4444'
      ctx.fillRect(p.x - w / 2, fatigueY, w * fatigueRatio, barH)
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

    const states: string[] = unit.envState

    let icons: string[] = [];

    if (unit.morale != 0) {
      const moraleSign = unit.morale > 0 ? '+' : '';
      icons.push(` ${moraleSign}${unit.morale} `)
    }

    if (unit.autoAttack) {
      icons.push('⚔')
    }

    if (unit.directView) {
      icons.push(unit.isDirectChain ? '◐' : '👁️')
    }

    if (unit.isRetreat) {
      icons.push('🏳️')
    }

    const formationIcon = getFormationIcon(unit.getFormation())
    if (formationIcon) {
      icons.push(formationIcon)
    }

    const envIcons = states
      .map(s => getEnvironmentIcon(s))
      .filter(Boolean)

    icons = [...icons, ...envIcons];

    if (!icons.length) return

    const text = icons.join(' ')
    const uiScale = this.getUiScale()
    ctx.font = `${14 * cam.zoom * uiScale}px system-ui`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const metrics = ctx.measureText(text)
    const bgW = metrics.width + 12 * cam.zoom * uiScale
    const bgH = 20 * cam.zoom * uiScale
    const y = p.y - h / 2 - bgH - 25 * cam.zoom * uiScale

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

  private drawHpLost(
    ctx: CanvasRenderingContext2D,
    cam: world['camera'],
    p: { x: number; y: number },
    _w: number,
    h: number,
    text: string,
    showLabel: boolean,
    showModifiers: boolean,
  ) {
    const uiScale = this.getUiScale()
    const s = cam.zoom * uiScale
    ctx.font = `${11 * s}px system-ui`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const metrics = ctx.measureText(text)
    const bgW = metrics.width + 8 * s
    const bgH = 16 * s
    let stackTop = p.y - h / 2
    if (showModifiers) stackTop -= 45 * s
    else if (showLabel) stackTop -= 24 * s
    else stackTop -= 6 * s
    const y = stackTop - 4 * s - bgH

    ctx.fillStyle = 'rgba(127, 29, 29, 0.72)'
    ctx.fillRect(p.x - bgW / 2, y, bgW, bgH)
    ctx.fillStyle = '#fecaca'
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

    const uiScale = this.getUiScale()
    ctx.font = `${12 * cam.zoom * uiScale}px system-ui`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const metrics = ctx.measureText(text)
    const bgW = metrics.width + 12 * cam.zoom * uiScale
    const bgH = 18 * cam.zoom * uiScale
    const y = p.y - h / 2 - bgH - 6 * cam.zoom * uiScale

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
    h: number,
    angle: number
  ) {
    if (!unit.isSelected()) return

    const uiScale = this.getUiScale()
    const pad = 2 * cam.zoom * uiScale

    ctx.strokeStyle = '#4ade80'
    ctx.lineWidth = 3 * cam.zoom * uiScale
    ctx.setLineDash([])
    ctx.lineDashOffset = 0

    ctx.translate(p.x, p.y)
    ctx.rotate(angle)
    ctx.translate(-w / 2, -h / 2)

    if (unit.type === unitType.MESSENGER) {
      const radius = Math.min(w, h) / 1.5 + pad

      ctx.beginPath()
      ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.strokeRect(-pad, -pad, w + pad * 2, h + pad * 2)
    }
  }

  private getFutureAngle(unit: BaseUnit): number {
    let from = unit.pos
    let to: vec2 | null = null

    for (const cmd of unit.getCommands()) {
      if (cmd.type !== UnitCommandTypes.Move) continue
      const state = cmd.getState().state as MoveCommandState
      if (to) from = to
      to = state.target
    }

    if (!to) return unit.angle

    const dx = to.x - from.x
    const dy = to.y - from.y
    if (dx === 0 && dy === 0) return unit.angle

    const tau = Math.PI * 2
    const angle = Math.atan2(dy, dx) + Math.PI / 2
    return ((angle % tau) + tau) % tau
  }
}
