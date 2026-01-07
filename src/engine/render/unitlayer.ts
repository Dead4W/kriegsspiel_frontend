import type { world } from '../world/world'
import {drawRoundRect, getTeamColor} from '@/engine/render/util.ts'
import { CLIENT_SETTING_KEYS } from '@/enums/clientSettingsKeys'
import { t } from '@/i18n'
import {drawUnitVision} from "@/engine/render/unitlayer/visionlayer.ts";
import {getUnitTexture} from "@/engine/assets/textures.ts";
import {
  drawAttackWaveIcons,
  drawMoveArrowChainIcons
} from "@/engine/render/canvasUtil.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import type {MoveCommandState} from "@/engine/units/commands/moveCommand.ts";
import {AttackCommand} from "@/engine/units/commands/attackCommand.ts";
import {
  AbilityAttackCommand,
} from "@/engine/units/commands/abilityAttackCommand.ts";
import {unitType} from "@/engine";
import {
  type UnitEnvironmentState,
  UnitEnvironmentStateIcon
} from "@/engine/units/enums/UnitStates.ts";

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
  private move_orders: Record<string, MoveOrderRange> = {}

  static readonly BASE_UNIT_W = 30
  static readonly BASE_UNIT_H = 15

  draw(ctx: CanvasRenderingContext2D, w: world) {
    const cam = w.camera
    const settings = window.CLIENT_SETTINGS

    const settingOpacity = settings[CLIENT_SETTING_KEYS.OPACITY_UNIT] ?? 1
    const unitScale = settings[CLIENT_SETTING_KEYS.SIZE_UNIT] ?? 1

    // ===== ОБЛАСТИ ВИДИМОСТИ (ОДИН СЛОЙ) =====
    if (settings[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION] && !settings[CLIENT_SETTING_KEYS.SHOW_HEIGHT_MAP]) {
      drawUnitVision(ctx, w);
    }

    this.calcMoveOrderIndex();

    const units = w.units
      .list()
      .sort((a, b) => (a.lastSelected ?? 0) - (b.lastSelected ?? 0))


    for (const u of units) {
      const unitOpacity = u.alive ? settingOpacity : 0.3

      const p = cam.worldToScreen(u.pos)

      // ===== ЦВЕТ ПО КОМАНДЕ =====
      const { r, g, b } = getTeamColor(u.team)
      ctx.fillStyle = `rgba(${r},${g},${b},${unitOpacity})`

      this.drawCommands(ctx, cam, u);

      // ===== РАЗМЕР ЮНИТА =====
      const wUnit = unitlayer.BASE_UNIT_W * cam.zoom * unitScale
      const hUnit = unitlayer.BASE_UNIT_H * cam.zoom * unitScale

      if (u.type === unitType.MESSENGER) {
        const radius = Math.min(wUnit, hUnit) / 1.5 * unitScale

        // === КРУЖОК ===
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
        ctx.fill()

        // === КРЕСТИК ===
        const crossSize = radius * 0.7
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'
        ctx.lineWidth = 0.5 * cam.zoom
        ctx.lineCap = 'round'

        ctx.beginPath()
        // \
        ctx.moveTo(p.x - crossSize, p.y - crossSize)
        ctx.lineTo(p.x + crossSize, p.y + crossSize)
        // /
        ctx.moveTo(p.x + crossSize, p.y - crossSize)
        ctx.lineTo(p.x - crossSize, p.y + crossSize)
        ctx.stroke()
      } else {
        ctx.fillRect(
          p.x - wUnit / 2,
          p.y - hUnit / 2,
          wUnit,
          hUnit
        )
      }

      const texture = u.type ? getUnitTexture(u.type) : null

      if (texture && texture.complete && texture.naturalWidth > 0) {
        ctx.globalAlpha = unitOpacity

        ctx.drawImage(
          texture,
          p.x - wUnit / 2,
          p.y - hUnit / 2,
          wUnit,
          hUnit
        )

        ctx.globalAlpha = 1
      }

      // ===== ОБВОДКА =====
      ctx.strokeStyle = 'black'
      ctx.lineWidth = 1 * cam.zoom
      if (u.type === unitType.MESSENGER) {
        const radius = Math.min(wUnit, hUnit) / 1.5 * unitScale

        ctx.beginPath()
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
        ctx.stroke()
      } else {
        ctx.strokeRect(
          p.x - wUnit / 2,
          p.y - hUnit / 2,
          wUnit,
          hUnit
        )
      }

      // ===== ВЫДЕЛЕНИЕ =====
      if (u.isSelected()) {
        const pad = 2 * cam.zoom

        ctx.strokeStyle = '#4ade80'
        ctx.lineWidth = 3 * cam.zoom

        if (u.type === unitType.MESSENGER) {
          const radius = Math.min(wUnit, hUnit) / 1.5 * unitScale + pad

          ctx.beginPath()
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
          ctx.stroke()
        } else {
          ctx.strokeRect(
            p.x - wUnit / 2 - pad,
            p.y - hUnit / 2 - pad,
            wUnit + pad * 2,
            hUnit + pad * 2
          )
        }
      }

      // ===== HP НА КАРТЕ =====
      if (settings[CLIENT_SETTING_KEYS.SHOW_HP_UNIT_ON_MAP] && u.hp != null) {
        const hpRatio = Math.max(0, Math.min(1, u.hp / u.stats.maxHp))

        const barWidth = wUnit
        const barHeight = 4 * cam.zoom
        const offsetY = 4 * cam.zoom

        const x = p.x - barWidth / 2
        const y = p.y + hUnit / 2 + offsetY

        // фон
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(x, y, barWidth, barHeight)

        // градиентный цвет HP
        ctx.fillStyle = hpGradientColor(hpRatio)
        ctx.fillRect(x, y, barWidth * hpRatio, barHeight)
      }

      // ИКОНКИ МОДИФИКАТОРЫ
      if (settings[CLIENT_SETTING_KEYS.SHOW_UNIT_MODIFICATORS]) {
        // получаем состояния (поддержка одного или массива)
        const states: UnitEnvironmentState[] = u.envState

        if (states.length) {
          const icons = states
            .map(s => UnitEnvironmentStateIcon[s])
            .filter(Boolean)

          if (icons.length) {
            const fontSize = 14 * cam.zoom
            const paddingX = 6 * cam.zoom
            const paddingY = 3 * cam.zoom
            const offsetY =
              (settings[CLIENT_SETTING_KEYS.SHOW_UNIT_LABELS] ? 22 : 8) * cam.zoom

            const text = icons.join(' ')
            ctx.font = `${fontSize}px system-ui, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'

            const metrics = ctx.measureText(text)
            const bgWidth = metrics.width + paddingX * 2
            const bgHeight = fontSize + paddingY * 2

            const bgX = p.x - bgWidth / 2
            const bgY =
              p.y - hUnit / 2 - bgHeight - offsetY

            // фон
            ctx.fillStyle = 'rgba(0,0,0,0.5)'
            drawRoundRect(ctx, bgX, bgY, bgWidth, bgHeight, 4 * cam.zoom)
            ctx.fill()

            // иконки
            ctx.fillStyle = 'white'
            ctx.fillText(text, p.x, bgY + bgHeight / 2)
          }
        }
      }

      // ===== ПОДПИСЬ =====
      if (settings[CLIENT_SETTING_KEYS.SHOW_UNIT_LABELS] && u.label) {
        const fontSize = 12 * cam.zoom
        const paddingX = 6 * cam.zoom
        const paddingY = 3 * cam.zoom
        const offsetY = 6 * cam.zoom

        ctx.font = `${fontSize}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        let text = u.label

        // тип юнита
        if (settings[CLIENT_SETTING_KEYS.SHOW_UNIT_LABEL_TYPE] && u.type) {
          const labelUnitType = t(`unit.${u.type}`);
          text += ` (${labelUnitType})`;
        }

        const metrics = ctx.measureText(text)
        const textWidth = metrics.width
        const textHeight = fontSize

        const bgWidth = textWidth + paddingX * 2
        const bgHeight = textHeight + paddingY * 2

        const bgX = p.x - bgWidth / 2
        const bgY = p.y - hUnit / 2 - bgHeight - offsetY

        // фон
        ctx.fillStyle = u.isSelected()
          ? 'rgba(74,222,128,0.55)'
          : 'rgba(0,0,0,0.55)'

        drawRoundRect(ctx, bgX, bgY, bgWidth, bgHeight, 4 * cam.zoom)
        ctx.fill()

        // текст
        ctx.fillStyle = 'white'
        ctx.fillText(text, p.x, bgY + bgHeight / 2)
      }
    }
  }

  calcMoveOrderIndex() {
    // Calc min/max move orderIndex
    type MoveOrderRange = {
      min: number
      max: number
    }
    const cmd_move_orders: Record<string, MoveOrderRange> = {}
    for (const u of window.ROOM_WORLD.units.list()) {
      for (const cmd of u.getCommands()) {
        if (cmd.type !== UnitCommandTypes.Move) continue

        const cmd_state = cmd.getState().state as MoveCommandState
        const id = cmd_state.uniqueId
        if (!cmd_move_orders[id]) {
          cmd_move_orders[id] = {
            min: cmd_state.orderIndex,
            max: cmd_state.orderIndex,
          }
          continue
        }
        cmd_move_orders[id].min = Math.min(
          cmd_move_orders[id].min,
          cmd_state.orderIndex
        )
        cmd_move_orders[id].max = Math.max(
          cmd_move_orders[id].max,
          cmd_state.orderIndex
        )
      }
    }

    this.move_orders = cmd_move_orders;
  }

  drawCommands(
    ctx: CanvasRenderingContext2D,
    cam: world['camera'],
    unit: BaseUnit
  ) {
    const commands = unit.getCommands()
    if (!commands.length) return

    ctx.globalAlpha = 0.8

    const { r, g, b } = getTeamColor(unit.team);
    const color = `rgba(${r},${g},${b},1)`;
    let from = unit.pos;

    let i = 0;
    for (const cmd of commands) {
      switch (cmd.type) {
        case UnitCommandTypes.Move: {
          const state = cmd.getState().state as MoveCommandState

          if (
            this.move_orders[state.uniqueId] &&
            (
              this.move_orders[state.uniqueId]!.min === state.orderIndex ||
              this.move_orders[state.uniqueId]!.max === state.orderIndex
            )
          ) {
            drawMoveArrowChainIcons(
              ctx,
              from,
              state.target,
              '#4587cc',
              cam.zoom
            )
          }
          from = state.target;
          break
        }

        case UnitCommandTypes.Attack:
        case UnitCommandTypes.AbilityAttack: {
          const command = cmd as AttackCommand | AbilityAttackCommand
          const targets = command.getPriorityTargets(unit)

          for (const target of targets) {
            drawAttackWaveIcons(
              ctx,
              unit.pos,
              target.pos,
              color,
              cam.zoom
            )
          }
          break
        }

        case UnitCommandTypes.ChangeFormation:
          // позже: иконка формации
          break
      }

      i++;
    }

    ctx.globalAlpha = 1;
  }
}
