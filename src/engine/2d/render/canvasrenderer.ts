import type { world } from '@/engine/world/world'
import { maplayer } from './maplayer'
import { unitlayer } from './unitlayer'
import { overlaylayer } from './overlaylayer'
import {cursorlayer} from "@/engine/2d/render/cursorlayer.ts";
import {debugPerformance} from "@/engine/debugPerformance.ts";
import {WeatherLayer} from "@/engine/2d/render/weatherlayer.ts";
import {PaintLayer} from "@/engine/2d/render/paintlayer.ts";
import type { RenderSceneAssets } from '@/engine/orchestrators/renderOrchestrator'
import { applyActiveZoneClip, buildActiveZoneClipPath, drawBackdrop } from '@/engine/2d/render/activeZoneClip'

export class canvasrenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  private overlayCanvas: HTMLCanvasElement
  private overlayCtx: CanvasRenderingContext2D

  private map = new maplayer()
  private units = new unitlayer()
  private overlay = new overlaylayer();
  private cursor = new cursorlayer();
  private weather = new WeatherLayer();
  private paint = new PaintLayer();

  // Считается в render() и переиспользуется в renderOverlay() того же кадра.
  private activeZoneClipPath: Path2D | null = null

  constructor(
    canvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
  ) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no_canvas_2d')
    this.ctx = ctx

    this.overlayCanvas = overlayCanvas
    const overlayCtx = overlayCanvas.getContext('2d')
    if (!overlayCtx) throw new Error('no_overlay_canvas_2d')
    this.overlayCtx = overlayCtx
  }

  setMapImage(img: CanvasImageSource) {
    this.map.setImage(img)
  }

  setSceneAssets(assets: RenderSceneAssets) {
    this.setMapImage(assets.mapImage)
  }

  resize(w: number, h: number) {
    const dpr = window.devicePixelRatio || 1

    this.canvas.width = Math.floor(w * dpr)
    this.canvas.height = Math.floor(h * dpr)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    this.overlayCanvas.width = Math.floor(w * dpr)
    this.overlayCanvas.height = Math.floor(h * dpr)
    this.overlayCanvas.style.width = `${w}px`
    this.overlayCanvas.style.height = `${h}px`
    this.overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  render(w: world) {
    debugPerformance('render', () => {
      debugPerformance('syncRemoteMoveFrames', () => {
        w.units.syncRemoteMoveFrames()
      })
      debugPerformance('syncCameraBounds', () => {
        w.syncCameraBounds()
      })
      debugPerformance('clearRect', () => {
        this.ctx.clearRect(0, 0, w.camera.viewport.x, w.camera.viewport.y)
        // Камера умеет отъезжать за край карты и за край зон, поэтому под всё
        // кладём фон — иначе там будет просвечивать страница.
        drawBackdrop(this.ctx, w)
      })
      // базовые параметры текста
      this.ctx.font = '12px system-ui'
      this.ctx.textBaseline = 'top'

      // Клип по активным зонам ставится один раз на все слои: сами слои
      // продолжают рисовать в мировых координатах и ничего не знают о зонах.
      this.activeZoneClipPath = buildActiveZoneClipPath(w)
      const releaseClip = applyActiveZoneClip(this.ctx, this.activeZoneClipPath)

      try {
        // слои
        debugPerformance('map.draw', () => {
          this.map.draw(this.ctx, w)
        })
        debugPerformance('paint.draw', () => {
          this.paint.draw(this.ctx, w)
        })
        debugPerformance('weather.draw', () => {
          this.weather.draw(this.ctx, w)
        })
        debugPerformance('units.draw', () => {
          this.units.draw(this.ctx, w)
        })
        debugPerformance('overlay.draw', () => {
          this.overlay.draw(this.ctx, w)
        })
      } finally {
        releaseClip()
      }
    })
  }

  renderOverlay(w: world) {
    debugPerformance('renderOverlay', () => {
      debugPerformance('clearRect', () => {
        this.overlayCtx.clearRect(0, 0, w.camera.viewport.x, w.camera.viewport.y)
      })

      // базовые параметры текста
      this.overlayCtx.font = '12px system-ui'
      this.overlayCtx.textBaseline = 'top'

      const releaseClip = applyActiveZoneClip(this.overlayCtx, this.activeZoneClipPath)
      try {
        this.cursor.draw(this.overlayCtx, w)
      } finally {
        releaseClip()
      }
    })
  }

  dispose() {}
}
