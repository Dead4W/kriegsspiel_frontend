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
      // восстановить базу
      for (const u of w.units.list()) {
        u.previewSelected = previewBaseSelection.has(u.id)
      }

      w.units.selectInRect(startWorld, currentWorld, true)

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

      w.events.emit('changed', { reason: 'select-preview' })
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
      if (!hit.selected) {
        if (!e.ctrlKey && !e.shiftKey) {
          w.units.clearSelection()
        }
        hit.selected = true
      }

      mode = 'drag'
      startWorld = worldPos
      dragOrigin.clear()

      for (const u of w.units.getSelected()) {
        dragOrigin.set(u.id, { ...u.pos })
      }

      canvas.setPointerCapture(e.pointerId)
      w.events.emit('changed', { reason: 'select-start' })
      return
    }

    // ===== EMPTY → RECT =====
    mode = 'select'
    startWorld = worldPos
    previewBaseSelection.clear()

    if (e.ctrlKey || e.shiftKey) {
      for (const u of w.units.list()) {
        if (u.selected) previewBaseSelection.add(u.id)
      }
    } else {
      w.units.clearSelection()
    }

    canvas.setPointerCapture(e.pointerId)
  })

  canvas.addEventListener('pointerup', (e) => {
    if (mode === 'select') {
      for (const u of w.units.list()) {
        if (u.previewSelected) {
          u.selected = true
          u.previewSelected = false
        }
      }
    }

    cleanup(e.pointerId)
    w.events.emit('changed', { reason: 'select-end' })
  })

  canvas.addEventListener('pointerleave', () => {
    cleanup()
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
    if (document.querySelector('.toolbar .active')) return
    if (e.key !== 'Delete' || e.repeat) return

    const selected = w.units.getSelected()
    if (!selected.length) return

    for (const u of selected) {
      w.units.remove(u.id)
    }

    w.overlay.clear()
    w.events.emit('changed', { reason: 'delete' })
  }

  window.addEventListener('keydown', onKeyDown)
}
