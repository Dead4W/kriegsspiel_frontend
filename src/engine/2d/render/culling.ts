import type { camera } from '@/engine/world/camera'

/**
 * Попадает ли точка в экранных координатах во вьюпорт с запасом margin.
 * margin задаётся в экранных пикселях и должен покрывать всё, что рисуется
 * вокруг точки (тело юнита, подписи, полосы HP).
 */
export function isScreenPointVisible(
  x: number,
  y: number,
  cam: camera,
  margin = 0
): boolean {
  return (
    x + margin >= 0 &&
    y + margin >= 0 &&
    x - margin <= cam.viewport.x &&
    y - margin <= cam.viewport.y
  )
}
