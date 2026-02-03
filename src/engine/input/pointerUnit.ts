import type {world} from '../world/world'
import type {vec2} from '../types'
import {CLIENT_SETTING_KEYS} from '@/enums/clientSettingsKeys.ts'
import {RoomGameStage} from "@/enums/roomStage.ts";
import {Team} from "@/enums/teamKeys.ts";
import {emitUnitCommandRequest} from "@/engine/input/unitCommandBus.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";

export function bindUnitInteraction(
  canvas: HTMLCanvasElement,
  w: world
) {
  let mode: 'idle' | 'drag' | 'select' | 'commandDrag' = 'idle'

  let startWorld: vec2 | null = null
  let currentWorld: vec2 | null = null

  let ctrlKeyActive = false
  let shiftKeyActive = false

  // preview-база
  const previewBaseSelection = new Set<string>()
  const previewBaseFutureSelection = new Set<string>()

  // drag
  const dragOrigin = new Map<string, vec2>()
  let commandDragPrepared = false

  // screen coords
  let screenX = 0
  let screenY = 0

  let rafId: number | null = null
  let dirty = false

  /* ================= RAF ================= */

  function requestTick() {
    if (rafId == null) {
      rafId = requestAnimationFrame(tick)
    }
  }

  function isAdminCommandActive() {
    const ordersDiv = document.querySelector('.orders-root div')
    return window.PLAYER.team === Team.ADMIN
    && window.ROOM_WORLD.stage === RoomGameStage.WAR
    && ordersDiv && !ordersDiv.classList.contains('orders-buttons')
  }

  function isHardModeEnabled() {
    return shiftKeyActive
  }

  function shouldDragAsCommand() {
    return window.PLAYER.team === Team.ADMIN
      && window.ROOM_WORLD.stage === RoomGameStage.WAR
      && !isHardModeEnabled()
  }

  function tick() {
    rafId = null
    if (!dirty || !startWorld) return
    dirty = false

    currentWorld = w.camera.screenToWorld({ x: screenX, y: screenY })
    if (!currentWorld) return

    // ===== DRAG =====
    if (mode === 'drag') {
      const dx = currentWorld.x - startWorld.x
      const dy = currentWorld.y - startWorld.y

      for (const u of w.units.getSelected()) {
        const origin = dragOrigin.get(u.id)!
        u.move({ x: origin.x + dx, y: origin.y + dy })
      }

      w.events.emit('changed', { reason: 'drag' })
      return
    }

    // ===== COMMAND DRAG (admin war, hard mode off) =====
    if (mode === 'commandDrag') {
      const dx = currentWorld.x - startWorld.x
      const dy = currentWorld.y - startWorld.y
      const dist = Math.hypot(dx, dy)

      // don't open/refresh command for tiny movements
      if (dist < 3) return

      // Prepare once: if unit is NOT futureSelected, reset its Move chain.
      // This must happen only when drag actually starts (dist>=3),
      // otherwise a simple click would unexpectedly clear planned moves.
      if (!commandDragPrepared) {
        commandDragPrepared = true
        for (const u of w.units.getSelected()) {
          if (u.futureSelected) continue
          const nonMove = u
            .getCommands()
            .filter((cmd) => cmd.type !== UnitCommandTypes.Move)
          u.setCommands(nonMove)
        }
      }

      const selected = w.units.getSelected()
      if (!selected.length) return

      // Drag semantics: translate whole selection (formation).
      let cx = 0
      let cy = 0
      for (const u of selected) {
        const origin = dragOrigin.get(u.id) ?? u.futurePos ?? u.pos
        cx += origin.x
        cy += origin.y
        if (u.selected && !u.futureSelected) {
          u.futureSelected = true;
        }
      }
      const center = { x: cx / selected.length, y: cy / selected.length }
      const target = { x: center.x + dx, y: center.y + dy }

      emitUnitCommandRequest({
        command: UnitCommandTypes.Move,
        move: {
          pos: target,
          append: false,
          moveMode: 'formation',
        },
      })
      return
    }

    // ===== SELECT PREVIEW =====
    if (mode === 'select') {
      for (const u of w.units.list()) {
        u.previewSelected = previewBaseSelection.has(u.id)
        u.previewFutureSelected = previewBaseFutureSelection.has(u.id)
      }

      w.units.selectInRect(startWorld, currentWorld, true)

      if (ctrlKeyActive) {
        // CTRL → exclude
        for (const u of w.units.list()) {
          // попал в рамку → убираем
          if (u.previewSelected && !previewBaseSelection.has(u.id)) {
            u.previewSelected = false
          }
          if (u.previewFutureSelected && !previewBaseFutureSelection.has(u.id)) {
            u.previewFutureSelected = false
          }
        }
      }

      w.overlay.set([
        {
          type: 'rect',
          from: startWorld,
          to: currentWorld,
          color: '#3cff00',
          width: 1,
          fillColor: 'rgba(60,255,0,0.15)',
        },
      ])
    }
  }

  /* ================= EVENTS ================= */

  canvas.addEventListener('pointermove', (e) => {
    if (window.INPUT.IGNORE_UNIT_INTERACTION) {
      // If something else captured pointer (e.g. paint tool),
      // cancel any active unit interaction immediately.
      if (mode !== 'idle') cleanup(e.pointerId)
      return
    }
    screenX = e.clientX
    screenY = e.clientY
    dirty = true
    requestTick()
  })

  w.events.on('camera', () => {
    dirty = true
    requestTick()
  })

  w.events.on('changed', ({ reason }) => {
    if (reason === 'camera') {
      dirty = true
      requestTick()
    }
  })

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return

    const worldPos = w.camera.screenToWorld({
      x: e.clientX,
      y: e.clientY,
    })

    let hit = w.units.pickAt(
      worldPos,
      15 * window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SIZE_UNIT]
    )
    let isFutureHit = false;
    if (!hit) {
      hit = w.units.pickAt(
        worldPos,
        15 * window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SIZE_UNIT],
        true
      )
      if (hit) isFutureHit = true;
    }

    // ===== CLICK ON UNIT =====
    if (hit) {
      const wasSelected = hit.selected

      if (e.ctrlKey) {
        // CTRL → toggle off
        if (isFutureHit) {
          hit.futureSelected = false;
          hit.selected = false;
        } else if (!hit.isFutureSelected()) {
          hit.selected = false;
        }
      // } else if (e.shiftKey || isAdminCommandActive()) {
      //   if (isFutureHit) {
      //     hit.futureSelected = true;
      //     hit.selected = true;
      //   } else if (!hit.isFutureSelected()) {
      //     hit.selected = true
      //   }
      //   // SHIFT → add
      } else {
        // обычный клик
        if (!wasSelected) {
          // клик по НЕвыделенному → сбрасываем всё
          w.units.clearSelection()
          if (isFutureHit) {
            hit.futureSelected = true;
            hit.selected = true;
          } else if (!hit.isFutureSelected()) {
            hit.selected = true;
          }
        }
        // если wasSelected === true → ничего не делаем (drag существующего selection)
      }

      const isCommandDrag = shouldDragAsCommand()
      mode = isCommandDrag ? 'commandDrag' : 'drag'
      startWorld = worldPos
      dragOrigin.clear()
      commandDragPrepared = false

      for (const u of w.units.getSelected()) {
        const origin = isCommandDrag
          ? (u.futureSelected ? (u.futurePos ?? u.pos) : u.pos)
          : u.pos
        dragOrigin.set(u.id, { ...origin })
      }

      canvas.setPointerCapture(e.pointerId)
      w.events.emit('changed', { reason: 'select' })
      return
    }

    // ===== EMPTY → RECT =====
    mode = 'select'
    startWorld = worldPos
    previewBaseSelection.clear()
    previewBaseFutureSelection.clear()

    if (e.shiftKey || isAdminCommandActive()) {
      // SHIFT → include (сохраняем базу)
      for (const u of w.units.list()) {
        if (u.selected) previewBaseSelection.add(u.id)
        if (u.futureSelected) previewBaseFutureSelection.add(u.id)
      }
    } else if (e.ctrlKey) {
      // CTRL → exclude (база = текущее выделение)
      for (const u of w.units.list()) {
        if (u.selected) previewBaseSelection.add(u.id)
        if (u.futureSelected) previewBaseFutureSelection.add(u.id)
      }
    } else {
      // обычное выделение
      w.units.clearSelection()
    }


    canvas.setPointerCapture(e.pointerId)
  })

  canvas.addEventListener('pointerup', (e) => {
    if (window.INPUT.IGNORE_UNIT_INTERACTION) {
      if (mode !== 'idle') cleanup(e.pointerId)
      return
    }
    if (mode === 'commandDrag' && startWorld) {
      const endWorld = w.camera.screenToWorld({ x: e.clientX, y: e.clientY })
      const dx = endWorld.x - startWorld.x
      const dy = endWorld.y - startWorld.y
      const dist = Math.hypot(dx, dy)

      const selected = w.units.getSelected()
      // tiny movement = treat as click (no order)
      if (selected.length && dist >= 3) {
        if (!commandDragPrepared) {
          commandDragPrepared = true
          for (const u of selected) {
            if (u.futureSelected) continue
            const nonMove = u
              .getCommands()
              .filter((cmd) => cmd.type !== UnitCommandTypes.Move)
            u.setCommands(nonMove)
          }
        }
        let cx = 0
        let cy = 0
        for (const u of selected) {
          const origin = dragOrigin.get(u.id) ?? u.futurePos ?? u.pos
          cx += origin.x
          cy += origin.y
        }
        const center = { x: cx / selected.length, y: cy / selected.length }
        const target = { x: center.x + dx, y: center.y + dy }

        emitUnitCommandRequest({
          command: UnitCommandTypes.Move,
          move: {
            pos: target,
            append: false,
            moveMode: 'formation',
            autoConfirm: true,
          },
        })
      }
    }
    if (mode === 'select') {
      for (const u of w.units.list()) {
        if (e.ctrlKey) {
          // CTRL → exclude
          if (u.previewSelected) {
            u.selected = false
          }
          if (u.previewFutureSelected) {
            u.selected = false
            u.futureSelected = false
          }
        } else {
          // SHIFT / обычный → include
          if (u.previewSelected) {
            u.selected = true
          }
          if (u.previewFutureSelected) {
            u.selected = true
            u.futureSelected = true
          }
        }
        u.previewSelected = false
        u.previewFutureSelected = false
      }
    }

    if (mode !== 'idle') {
      cleanup(e.pointerId)
      w.events.emit('changed', { reason: 'select' })
    }
  })

  canvas.addEventListener('pointerleave', () => {
    if (window.INPUT.IGNORE_UNIT_INTERACTION) {
      cleanup()
      return
    }
    cleanup()
  })

  canvas.addEventListener('dblclick', (e) => {
    const worldPos = w.camera.screenToWorld({
      x: e.clientX,
      y: e.clientY,
    })

    const hit = w.units.pickAt(
      worldPos,
      15 * window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SIZE_UNIT]
    )

    if (!hit) return

    if (!shiftKeyActive && !isAdminCommandActive()) {
      for (const u of w.units.list()) {
        if (u.id != hit.id) {
          u.selected = false
        }
      }
    }

    const cam = w.camera
    const CAMERA_OFFSET = 0.95

    const vp = cam.viewport

    // центр экрана → мир
    const centerWorld = cam.screenToWorld({
      x: vp.x * 0.5,
      y: vp.y * 0.5,
    })
    if (!centerWorld) return

    // 10% от viewport
    const halfW = (vp.x * CAMERA_OFFSET * 0.5) / cam.zoom
    const halfH = (vp.y * CAMERA_OFFSET * 0.5) / cam.zoom

    const minX = centerWorld.x - halfW
    const maxX = centerWorld.x + halfW
    const minY = centerWorld.y - halfH
    const maxY = centerWorld.y + halfH

    for (const u of w.units.list()) {
      if (u.type !== hit.type) continue
      if (u.team !== hit.team) continue

      const { x, y } = u.pos

      if (
        x >= minX &&
        x <= maxX &&
        y >= minY &&
        y <= maxY
      ) {
        u.selected = true
      }
    }

    w.events.emit('changed', { reason: 'select' })
  })

  function cleanup(pointerId?: number) {
   if (mode !== 'idle') {
     previewBaseSelection.clear()
     previewBaseFutureSelection.clear()
     dragOrigin.clear()
     commandDragPrepared = false
     startWorld = null
     currentWorld = null
     dirty = false
     mode = 'idle'

     w.overlay.clear()
     if (pointerId != null) {
       canvas.releasePointerCapture(pointerId)
     }
   }
  }

  /* ================= DELETE ================= */

  function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey) ctrlKeyActive = true
    if (e.shiftKey) shiftKeyActive = true
    if (e.key !== 'Delete' || e.repeat) return
    if (window.INPUT.IGNORE_UNIT_INTERACTION) return

    const selected = w.units.getSelected()
    if (!selected.length) return

    for (const u of selected) {
      w.units.remove(u.id)
    }

    w.overlay.clear()
    w.events.emit('changed', { reason: 'delete' })
  }

  function onKeyUp(e: KeyboardEvent) {
    if (!e.ctrlKey) ctrlKeyActive = false
    if (!e.shiftKey) shiftKeyActive = false
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
}
