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
    // Если есть выделение — ПКМ используется для контекстных приказов,
    // а не для перетаскивания камеры.
    if (w.units.getSelected().length > 0) return

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
      // Минимальный (самый "отдалённый") зум ограничиваем размерами карты:
      // видимая область (viewport / zoom) не должна превышать worldSize.
      const eps = 0.0001
      const fitX =
        cam.worldSize.x > 0 ? cam.viewport.x / cam.worldSize.x : eps
      const fitY =
        cam.worldSize.y > 0 ? cam.viewport.y / cam.worldSize.y : eps
      const minZoomFromMap = Math.max(eps, fitX, fitY)

      // Максимальный (самый "приближённый") зум оставляем как прежде,
      // но гарантируем, что он не меньше minZoomFromMap.
      const maxZoom = Math.max(4, minZoomFromMap)

      const targetZoom = oldZoom * (dir > 0 ? 0.9 : 1.1)
      const newZoom = Math.min(maxZoom, Math.max(minZoomFromMap, targetZoom))

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
