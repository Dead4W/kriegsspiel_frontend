import type { world } from '@/engine/world/world'
import { getActiveZoneRects, isActiveZoneViewRestricted } from '@/game/planningSpawns'

/**
 * Путь-объединение активных зон в экранных координатах.
 *
 * Зоны рисуются одним Path2D одинаковым обходом, поэтому nonzero-заливка даёт
 * объединение и пересекающиеся зоны не "вычитаются" друг из друга.
 *
 * null означает "резать нечего": админ на расстановке, или зоны не заданы.
 */
export function buildActiveZoneClipPath(w: world): Path2D | null {
  if (!isActiveZoneViewRestricted(w.stage)) return null

  const zones = getActiveZoneRects()
  if (!zones.length) return null

  const cam = w.camera
  const path = new Path2D()
  let hasArea = false

  for (const zone of zones) {
    const from = cam.worldToScreen(zone.from)
    const to = cam.worldToScreen(zone.to)
    const width = to.x - from.x
    const height = to.y - from.y
    if (width <= 0 || height <= 0) continue
    path.rect(from.x, from.y, width, height)
    hasArea = true
  }

  return hasArea ? path : null
}

// Фон под всем, что не является картой: край зоны, край карты при отдалении.
const BACKDROP_COLOR = '#020617'

export function drawBackdrop(ctx: CanvasRenderingContext2D, w: world) {
  ctx.fillStyle = BACKDROP_COLOR
  ctx.fillRect(0, 0, w.camera.viewport.x, w.camera.viewport.y)
}

/**
 * Ставит клип по активным зонам. Всё, что слои рисуют мимо зон, отсекается
 * самим контекстом, так что мировые координаты в слоях остаются нетронутыми.
 * Возвращает функцию снятия клипа.
 */
export function applyActiveZoneClip(
  ctx: CanvasRenderingContext2D,
  clipPath: Path2D | null,
): () => void {
  if (!clipPath) return () => {}

  ctx.save()
  ctx.clip(clipPath)

  return () => ctx.restore()
}
