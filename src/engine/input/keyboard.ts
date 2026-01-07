import type { world } from '../world/world'

export function bindKeyboard(w: world) {
  const keys = new Set<string>()
  let running = true

  const SPEED = 1000 // мировые единицы в секунду

  window.addEventListener('keydown', (e) => {
    keys.add(e.code)
  })

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code)
  })

  let lastTime = performance.now()

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
      w.events.emit('changed', { reason: 'camera' })
    }

    requestAnimationFrame(loop)
  }

  requestAnimationFrame(loop)

  return () => {
    running = false
  }
}
