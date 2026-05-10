import type { world } from '@/engine/world/world'
import { mount2DInput } from '@/engine/2d/runtime'
import { mount3DInput } from '@/engine/3d/runtime'

export type InputBackend = '2d' | '3d'
type Teardown = () => void

export class InputOrchestrator {
  constructor(private backend: InputBackend = '2d') {}

  setBackend(backend: InputBackend) {
    this.backend = backend
  }

  mount(canvas: HTMLCanvasElement, w: world): Teardown {
    switch (this.backend) {
      case '2d':
        return mount2DInput(canvas, w)
      case '3d':
        return mount3DInput(canvas, w)
    }
  }
}

