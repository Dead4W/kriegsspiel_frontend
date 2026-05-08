import type { world } from '@/engine/world/world'
import {
  bindKeyboard,
  bindPointer,
  bindUnitContextCommands,
  bindUnitInteraction,
} from '@/engine/2d/input'

type Teardown = () => void

/**
 * Mounts all current 2D input handlers and returns one teardown callback.
 * New 2D input binders should be added here, not directly in views.
 */
export function mount2DInput(canvas: HTMLCanvasElement, w: world): Teardown {
  const teardowns: Teardown[] = []

  teardowns.push(bindPointer(canvas, w))
  teardowns.push(bindKeyboard(w))
  teardowns.push(bindUnitInteraction(canvas, w))
  teardowns.push(bindUnitContextCommands(w))

  return () => {
    for (let i = teardowns.length - 1; i >= 0; i--) {
      teardowns[i]!()
    }
  }
}

