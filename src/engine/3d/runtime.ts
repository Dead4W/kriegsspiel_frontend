import type { world } from '@/engine/world/world'

type Teardown = () => void

/**
 * 3D input is handled inside the renderer via OrbitControls.
 * Keep the same mount API so orchestrators can switch backends.
 */
export function mount3DInput(_canvas: HTMLCanvasElement, _w: world): Teardown {
  return () => {}
}
