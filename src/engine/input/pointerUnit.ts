import type {world} from '../world/world'
import type {vec2} from '../types'
import {CLIENT_SETTING_KEYS} from '@/enums/clientSettingsKeys.ts'
import {RoomGameStage} from "@/enums/roomStage.ts";

export function bindUnitInteraction(
  canvas: HTMLCanvasElement,
  w: world
) {
  let mode: 'idle' | 'drag' | 'select' = 'idle'

  let startWorld: vec2 | null = null
  let currentWorld: vec2 | null = null

  let ctrlKeyActive = false
  let shiftKeyActive = false

  // preview-база
  const previewBaseSelection = new Set<string>()

  // drag
  const dragOrigin = new Map<string, vec2>()

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

    // ===== SELECT PREVIEW =====
    if (mode === 'select') {
      for (const u of w.units.list()) {
        u.previewSelected = previewBaseSelection.has(u.id)
      }

      w.units.selectInRect(startWorld, currentWorld, true)

      if (ctrlKeyActive) {
        // CTRL → exclude
        for (const u of w.units.list()) {
          if (u.previewSelected && !previewBaseSelection.has(u.id)) {
            // попал в рамку → убираем
            u.previewSelected = false
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

      // w.events.emit('changed', { reason: 'select' })
    }
  }

  /* ================= EVENTS ================= */

  canvas.addEventListener('pointermove', (e) => {
    screenX = e.clientX
    screenY = e.clientY
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

    const hit = w.units.pickAt(
      worldPos,
      15 * window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SIZE_UNIT]
    )

    // ===== CLICK ON UNIT =====
    if (hit) {
      const wasSelected = hit.selected

      if (e.ctrlKey) {
        // CTRL → toggle off
        hit.selected = false
      } else if (e.shiftKey) {
        // SHIFT → add
        hit.selected = true
      } else {
        // обычный клик
        if (!wasSelected) {
          // клик по НЕвыделенному → сбрасываем всё
          w.units.clearSelection()
          hit.selected = true
        }
        // если wasSelected === true → ничего не делаем (drag существующего selection)
      }

      mode = 'drag'
      startWorld = worldPos
      dragOrigin.clear()

      for (const u of w.units.getSelected()) {
        dragOrigin.set(u.id, { ...u.pos })
      }

      canvas.setPointerCapture(e.pointerId)
      w.events.emit('changed', { reason: 'select' })
      return
    }

    // ===== EMPTY → RECT =====
    mode = 'select'
    startWorld = worldPos
    previewBaseSelection.clear()

    if (e.shiftKey) {
      // SHIFT → include (сохраняем базу)
      for (const u of w.units.list()) {
        if (u.selected) previewBaseSelection.add(u.id)
      }
    } else if (e.ctrlKey) {
      // CTRL → exclude (база = текущее выделение)
      for (const u of w.units.list()) {
        if (u.selected) previewBaseSelection.add(u.id)
      }
    } else {
      // обычное выделение
      w.units.clearSelection()
    }


    canvas.setPointerCapture(e.pointerId)
  })

  canvas.addEventListener('pointerup', (e) => {
    if (mode === 'select') {
      for (const u of w.units.list()) {
        if (e.ctrlKey) {
          // CTRL → exclude
          if (u.previewSelected) {
            u.selected = false
          }
        } else {
          // SHIFT / обычный → include
          if (u.previewSelected) {
            u.selected = true
          }
        }
        u.previewSelected = false
      }
    }

    if (mode !== 'idle') {
      cleanup(e.pointerId)
      w.events.emit('changed', { reason: 'select' })
    }
  })

  canvas.addEventListener('pointerleave', () => {
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

    if (!shiftKeyActive) {
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
     dragOrigin.clear()
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
