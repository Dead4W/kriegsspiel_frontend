import type { world } from '../world/world'
import { maplayer } from './maplayer'
import { unitlayer } from './unitlayer'
import { overlaylayer } from './overlaylayer'
import {cursorlayer} from "@/engine/render/cursorlayer.ts";
import {debugPerformance} from "@/engine/debugPerformance.ts";
import {WeatherLayer} from "@/engine/render/weatherlayer.ts";

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
      debugPerformance('clearRect', () => {
        this.ctx.clearRect(0, 0, w.camera.viewport.x, w.camera.viewport.y)
      })
      // базовые параметры текста
      this.ctx.font = '12px system-ui'
      this.ctx.textBaseline = 'top'

      // слои
      debugPerformance('map.draw', () => {
        this.map.draw(this.ctx, w)
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

      this.cursor.draw(this.overlayCtx, w)
    })
  }
}
