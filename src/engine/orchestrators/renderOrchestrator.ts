import type { world } from '@/engine/world/world'
import { canvasrenderer } from '@/engine/2d/render'
import { threeRenderer } from '@/engine/3d/render'

export type RenderBackend = '2d' | '3d'

export type RenderSceneAssets = {
  mapImage: CanvasImageSource
  objectMapImage?: ImageBitmap | null
  objectMapMeta?: Record<string, unknown> | null
  metersPerPixel: number
}

export type EngineRenderer = {
  setMapImage(img: CanvasImageSource): void
  setSceneAssets?(assets: RenderSceneAssets): Promise<void> | void
  getCameraState?(): unknown
  setCameraState?(state: unknown): void
  resize(w: number, h: number): void
  render(w: world): void
  renderOverlay(w: world): void
  dispose?(): void
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
        return new threeRenderer(canvas, overlayCanvas)
    }
  }
}

