import type { world } from '@/engine/world/world'
import { canvasrenderer } from '@/engine/2d/render'

export type RenderBackend = '2d' | '3d'

export type EngineRenderer = {
  setMapImage(img: CanvasImageSource): void
  resize(w: number, h: number): void
  render(w: world): void
  renderOverlay(w: world): void
}

export class RenderOrchestrator {
  constructor(private backend: RenderBackend = '2d') {}

  setBackend(backend: RenderBackend) {
    this.backend = backend
  }

  createRenderer(
    canvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement
  ): EngineRenderer {
    switch (this.backend) {
      case '2d':
        return new canvasrenderer(canvas, overlayCanvas)
      case '3d':
        throw new Error('render_backend_3d_not_implemented')
    }
  }
}

