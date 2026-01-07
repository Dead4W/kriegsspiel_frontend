import type {MoveFrame} from "@/engine/types.ts";

export type RafInterval = {
  start(): void
  stop(): void
  isRunning(): boolean
}

export function createRafInterval(
  delay: number,
  fn: () => void
): RafInterval {
  let acc = 0
  let last = 0
  let running = false
  let rafId = 0

  function loop(now: number) {
    if (!running) return

    if (last === 0) last = now
    const dt = now - last
    last = now

    acc += dt

    while (acc >= delay) {
      fn()
      acc -= delay
    }

    rafId = requestAnimationFrame(loop)
  }

  return {
    start() {
      if (running) return
      running = true
      acc = 0
      last = 0
      rafId = requestAnimationFrame(loop)
    },

    stop() {
      running = false
      last = 0
      acc = 0
      if (rafId) cancelAnimationFrame(rafId)
      rafId = 0
    },

    isRunning() {
      return running
    }
  }
}

export function interpolateMoveFrames(
  frames: MoveFrame[],
  step = 3,
): MoveFrame[] {
  if (frames.length < 2) return frames

  const result: MoveFrame[] = []

  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i]!
    const b = frames[i + 1]!

    result.push(a)

    const dt = b.t - a.t
    const steps = Math.floor(dt / step)

    for (let s = 1; s < steps; s++) {
      const t = (s * step) / dt

      result.push({
        t: a.t + s * step,
        pos: {
          x: a.pos.x + (b.pos.x - a.pos.x) * t,
          y: a.pos.y + (b.pos.y - a.pos.y) * t,
        },
      })
    }
  }

  result.push(frames[frames.length - 1]!)
  return result
}
