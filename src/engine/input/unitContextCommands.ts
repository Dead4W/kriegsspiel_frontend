import type { world } from '@/engine/world/world'
import { CLIENT_SETTING_KEYS } from '@/enums/clientSettingsKeys'
import { unitType } from '@/engine/units/types'
import { UnitCommandTypes } from '@/engine/units/enums/UnitCommandTypes'
import { emitUnitCommandRequest } from '@/engine/input/unitCommandBus'
import type { BaseUnit } from '@/engine/units/baseUnit'

function isUiEventTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el?.closest?.('.krig-ui')
}

function unitPickRadius() {
  return 15 * (window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SIZE_UNIT] ?? 1)
}

function countUnitsAt(
  w: world,
  pos: { x: number; y: number },
  radius: number
) {
  const r2 = radius * radius
  let n = 0
  for (const u of w.units.list()) {
    const dx = u.pos.x - pos.x
    const dy = u.pos.y - pos.y
    if (dx * dx + dy * dy <= r2) n++
  }
  return n
}

function areSelectedUnitsSameTeam(w: world) {
  const selected = w.units.getSelected()
  if (!selected.length) return false
  const t = selected[0]!.team
  return selected.every((u) => u.team === t)
}

function areSelectedUnitsAllMessengers(w: world) {
  const selected = w.units.getSelected()
  if (!selected.length) return false
  return selected.every((u) => u.type === unitType.MESSENGER)
}

function canAnySelectedUnitAttackTarget(w: world, target: BaseUnit) {
  const selected = w.units.getSelected()
  if (!selected.length) return false
  if (!target.alive || target.isTimeout) return false

  // In UI attack is disabled only when ALL selected are messengers.
  if (selected.every((u) => u.type === unitType.MESSENGER)) return false

  for (const a of selected) {
    if (!a.alive || a.isTimeout) continue
    if (a.team === target.team) continue
    const dx = target.pos.x - a.pos.x
    const dy = target.pos.y - a.pos.y
    if (dx * dx + dy * dy <= a.attackRange * a.attackRange) return true
  }
  return false
}

function isAnyOrderOpen() {
  // UnitCommandTool показывает .orders-buttons ТОЛЬКО когда activeOrder = null.
  // Когда открыт приказ (CommandMove/Attack/...) — .orders-buttons отсутствует.
  return !document.querySelector('.orders-buttons')
}

/**
 * Global RMB handler for "context commands" for selected units.
 * Replaces logic previously located in UnitCommandTool.vue.
 */
export function bindUnitContextCommands(w: world) {
  const onPointerDownCapture = (e: PointerEvent) => {
    if (e.button !== 2) return
    if (window.INPUT.IGNORE_UNIT_INTERACTION) return
    if (window.INPUT.IGNORE_DRAG) return
    if (isAnyOrderOpen()) return
    if (!w.units.getSelected().length) return
    if (!areSelectedUnitsSameTeam(w)) return
    if (isUiEventTarget(e.target)) return

    // есть выделение → ПКМ = контекстный приказ (и гасим drag камеры)
    e.preventDefault()
    e.stopPropagation()

    const pos = w.camera.screenToWorld({ x: e.clientX, y: e.clientY })
    const radius = unitPickRadius()
    const hit = w.units.pickAt(pos, radius)

    const selectedTeam = w.units.getSelected()[0]!.team

    // ===== CONTEXT → COMMAND REQUEST =====
    if (hit && hit.team !== selectedTeam) {
      // Full checks: don't open Attack if nobody can reach this target.
      if (!canAnySelectedUnitAttackTarget(w, hit)) return
      for (const u of w.units.getSelected()) {
        u.setCommands(
          u
            .getCommands()
            .filter((cmd) => cmd.type !== UnitCommandTypes.Attack)
        );
      }
      emitUnitCommandRequest({
        command: UnitCommandTypes.Attack,
        selectUnitId: hit.id,
      })
      return
    }

    if (hit && hit.team === selectedTeam) {
      // союзник + Messenger → delivery (если под курсором ровно 1 юнит)
      if (
        areSelectedUnitsAllMessengers(w) &&
        countUnitsAt(w, pos, radius) === 1
      ) {
        for (const u of w.units.getSelected()) {
          u.setCommands(
            u
              .getCommands()
              .filter((cmd) => cmd.type !== UnitCommandTypes.Delivery)
          );
        }
        emitUnitCommandRequest({
          command: UnitCommandTypes.Delivery,
          selectUnitId: hit.id,
        })
        return
      }
    }

    // пустое место (или прочий контекст) → move
    for (const u of w.units.getSelected()) {
      if (!u.isFutureSelected()) {
        const nonMove = u
        .getCommands()
        .filter((cmd) => cmd.type !== UnitCommandTypes.Move)
        u.setCommands(nonMove);
        u.futureSelected = true;
      }
    }
    emitUnitCommandRequest({
      command: UnitCommandTypes.Move,
      move: {
        pos,
        append: e.shiftKey,
      },
    })
  }

  // capture=true: перехватываем до canvas, чтобы отключить drag камеры на ПКМ.
  window.addEventListener('pointerdown', onPointerDownCapture, true)
}

