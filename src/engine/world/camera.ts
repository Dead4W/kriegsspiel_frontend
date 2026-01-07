import type { vec2 } from '../types'
import { clamp } from '../math'

export class camera {
  pos: vec2 = { x: 0, y: 0 } // top-left в world coords
  zoom = 1

  viewport: vec2 = { x: 800, y: 600 } // canvas size
  worldSize: vec2 = { x: 2000, y: 2000 } // map size

  setViewport(w: number, h: number) {
    this.viewport = { x: w, y: h }
    this.clampToWorld()
  }

  setWorldSize(w: number, h: number) {
    this.worldSize = { x: w, y: h }
    this.pos = {x: w / 2, y: h / 2};
    this.clampToWorld()
  }

  clampToWorld() {
    const maxX = Math.max(0, this.worldSize.x - this.viewport.x / this.zoom)
    const maxY = Math.max(0, this.worldSize.y - this.viewport.y / this.zoom)

    this.pos.x = clamp(this.pos.x, 0, maxX)
    this.pos.y = clamp(this.pos.y, 0, maxY)
  }

  worldToScreen(p: vec2): vec2 {
    return {
      x: (p.x - this.pos.x) * this.zoom,
      y: (p.y - this.pos.y) * this.zoom,
    }
  }

  screenToWorld(p: vec2): vec2 {
    return {
      x: p.x / this.zoom + this.pos.x,
      y: p.y / this.zoom + this.pos.y,
    }
  }
}
