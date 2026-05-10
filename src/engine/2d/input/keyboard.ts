import type { world } from '@/engine/world/world'
import { InputLifecycle } from '@/engine/input/lifecycle'

export function bindKeyboard(w: world) {
  const keys = new Set<string>()
  let running = true
  const lifecycle = new InputLifecycle()

  const SPEED = 1000 // мировые единицы в секунду

  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code)
  }

  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code)
  }

  lifecycle.listen(window, 'keydown', onKeyDown)
  lifecycle.listen(window, 'keyup', onKeyUp)

  let lastTime = performance.now()
  let rafId: number | null = null

  function loop(time: number) {
    if (!running) return

    const dt = (time - lastTime) / 1000
    lastTime = time

    let dx = 0
    let dy = 0

    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1

    if (dx !== 0 || dy !== 0) {
      const cam = w.camera
      const speed = SPEED / cam.zoom

      cam.pos.x += dx * speed * dt
      cam.pos.y += dy * speed * dt

      cam.clampToWorld()
      w.events.emit('camera', {}).then()
    }

    rafId = requestAnimationFrame(loop)
  }

  rafId = requestAnimationFrame(loop)

  return () => {
    running = false
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    lifecycle.dispose()
  }
}
