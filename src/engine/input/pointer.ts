import type { world } from '../world/world'
import type { vec2 } from '../types'
import { sub } from '../math'

export function bindPointer(canvas: HTMLCanvasElement, w: world) {
  let dragging = false
  let last: vec2 | null = null
  let current: vec2 | null = null
  let needUpdate = false

  // отключаем контекстное меню
  document.body.addEventListener('contextmenu', (e) => e.preventDefault())

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 2) return
    if (window.INPUT.IGNORE_DRAG) return

    dragging = true
    last = { x: e.clientX, y: e.clientY }
    current = last

    canvas.style.cursor = 'grabbing'
    canvas.setPointerCapture(e.pointerId)
  })

  canvas.addEventListener('pointerup', (e) => {
    if (e.button !== 2) return

    dragging = false
    last = null
    current = null
    canvas.style.cursor = 'default'
  })

  canvas.addEventListener('pointerleave', () => {
    dragging = false
    last = null
    current = null
    canvas.style.cursor = 'default'
  })

  canvas.addEventListener('pointermove', (e) => {
    current = { x: e.clientX, y: e.clientY }
    needUpdate = true
  })

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()

      const cam = w.camera
      const rect = canvas.getBoundingClientRect()

      const mouseScreen = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }

      const before = cam.screenToWorld(mouseScreen)

      const dir = Math.sign(e.deltaY)
      const oldZoom = cam.zoom
      const newZoom = Math.max(
        0.25,
        Math.min(4, oldZoom * (dir > 0 ? 0.9 : 1.1))
      )

      if (newZoom === oldZoom) return

      cam.zoom = newZoom

      const after = cam.screenToWorld(mouseScreen)
      cam.pos.x += before.x - after.x
      cam.pos.y += before.y - after.y

      cam.clampToWorld()
      w.events.emit('camera', {}).then()
    },
    { passive: false }
  )

  function frame() {
    if (needUpdate && current) {
      // обновляем курсор
      const worldPos = w.camera.screenToWorld(current)
      w.cursor.setCurrentPos(worldPos)

      if (dragging && last) {
        const delta = sub(current, last)

        w.camera.pos.x -= delta.x / w.camera.zoom
        w.camera.pos.y -= delta.y / w.camera.zoom
        w.camera.clampToWorld()

        // w.events.emit('changed', { reason: 'camera' })
        last = current
      }

      needUpdate = false
    }

    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)

  canvas.addEventListener('mouseenter', () => {
    canvas.style.cursor = dragging ? 'grabbing' : 'default'
  })

  canvas.addEventListener('mouseleave', () => {
    canvas.style.cursor = 'default'
  })
}
