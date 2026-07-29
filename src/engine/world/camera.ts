import type { vec2 } from '../types'
import { clamp } from '../math'

export type cameraBounds = {
  min: vec2
  max: vec2
}

const MAX_ZOOM = 4
// Отдаление размером карты не ограничено: край карты не должен быть стеной.
// Границу держим только чтобы зум не уходил в бесконечность.
const MIN_ZOOM = 0.05

export class camera {
  pos: vec2 = { x: 0, y: 0 } // top-left в world coords
  zoom = 1

  viewport: vec2 = { x: 800, y: 600 } // canvas size
  worldSize: vec2 = { x: 2000, y: 2000 } // map size

  // Часть мира, за которую камера не может выехать. По умолчанию — вся карта,
  // но для игроков её сужают до активных зон. Координаты остаются мировыми,
  // меняются только пределы, поэтому остальной рендер трогать не нужно.
  bounds: cameraBounds = { min: { x: 0, y: 0 }, max: { x: 2000, y: 2000 } }

  setViewport(w: number, h: number) {
    this.viewport = { x: w, y: h }
    this.clampToWorld()
  }

  setWorldSize(w: number, h: number) {
    this.worldSize = { x: w, y: h }
    this.bounds = { min: { x: 0, y: 0 }, max: { x: w, y: h } }
    this.centerOnBounds()
    this.clampToWorld()
  }

  /** null возвращает камеру к полной карте. Возвращает true, если пределы изменились. */
  setBounds(next: { from: vec2; to: vec2 } | null): boolean {
    const minX = next ? clamp(Math.min(next.from.x, next.to.x), 0, this.worldSize.x) : 0
    const minY = next ? clamp(Math.min(next.from.y, next.to.y), 0, this.worldSize.y) : 0
    const maxX = next ? clamp(Math.max(next.from.x, next.to.x), minX, this.worldSize.x) : this.worldSize.x
    const maxY = next ? clamp(Math.max(next.from.y, next.to.y), minY, this.worldSize.y) : this.worldSize.y

    const current = this.bounds
    if (
      current.min.x === minX && current.min.y === minY
      && current.max.x === maxX && current.max.y === maxY
    ) {
      return false
    }

    const wasOutside = !this.isInsideBounds()
    this.bounds = { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } }
    // Камера могла стоять в куске карты, который только что стал недоступен:
    // в этом случае показываем центр новых пределов, а не край.
    if (wasOutside || !this.isInsideBounds()) {
      this.centerOnBounds()
    }
    this.clampToWorld()
    return true
  }

  getMinZoom(): number {
    return MIN_ZOOM
  }

  getMaxZoom(): number {
    return MAX_ZOOM
  }

  /** Половина видимой области в мировых координатах. */
  private halfView(): vec2 {
    const zoom = clamp(this.zoom, MIN_ZOOM, MAX_ZOOM)
    return {
      x: this.viewport.x / zoom / 2,
      y: this.viewport.y / zoom / 2,
    }
  }

  /** Центр экрана в мировых координатах. */
  getCenter(): vec2 {
    const half = this.halfView()
    return { x: this.pos.x + half.x, y: this.pos.y + half.y }
  }

  setCenter(center: vec2) {
    const half = this.halfView()
    this.pos = { x: center.x - half.x, y: center.y - half.y }
  }

  centerOnBounds() {
    this.setCenter({
      x: (this.bounds.min.x + this.bounds.max.x) / 2,
      y: (this.bounds.min.y + this.bounds.max.y) / 2,
    })
  }

  private isInsideBounds(): boolean {
    const center = this.getCenter()
    return (
      center.x >= this.bounds.min.x
      && center.y >= this.bounds.min.y
      && center.x <= this.bounds.max.x
      && center.y <= this.bounds.max.y
    )
  }

  clampToWorld() {
    this.zoom = clamp(this.zoom, MIN_ZOOM, MAX_ZOOM)

    // Ограничиваем центр экрана, а не всю видимую область: улететь за край
    // можно почти целиком, но центр всегда остаётся над доступной областью.
    const half = this.halfView()
    this.pos.x = clamp(this.pos.x, this.bounds.min.x - half.x, this.bounds.max.x - half.x)
    this.pos.y = clamp(this.pos.y, this.bounds.min.y - half.y, this.bounds.max.y - half.y)
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
