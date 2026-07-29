import type { RoomGameStage } from '@/enums/roomStage'
import {
  getActiveZoneBounds,
  getActiveZoneRects,
  isActiveZoneViewRestricted,
  isPointInsideAnyRect,
  type SpawnRect,
} from '@/game/planningSpawns'
import type { ParsedColorMask } from './mask'

/**
 * Прямоугольник в метрах сцены. Пиксель карты (px, py) лежит в мире по
 * x = (px - width / 2) * cellSize, z = (py - height / 2) * cellSize,
 * то есть сцена центрирована на карте.
 */
export type SceneBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type SceneWorldSize = {
  width: number
  height: number
  cellSize: number
}

/** Активные зоны в пикселях карты. Пусто — резать нечего, строим всю карту. */
export function getSceneActiveZoneRects(stage: RoomGameStage): SpawnRect[] {
  if (!isActiveZoneViewRestricted(stage)) return []
  return getActiveZoneRects()
}

export function mapRectToSceneBounds(rect: SpawnRect, size: SceneWorldSize): SceneBounds {
  return {
    minX: (rect.from.x - size.width / 2) * size.cellSize,
    maxX: (rect.to.x - size.width / 2) * size.cellSize,
    minZ: (rect.from.y - size.height / 2) * size.cellSize,
    maxZ: (rect.to.y - size.height / 2) * size.cellSize,
  }
}

function getFullMapRect(size: SceneWorldSize): SpawnRect {
  return { from: { x: 0, y: 0 }, to: { x: size.width, y: size.height } }
}

/**
 * Куски сцены, которые надо построить: каждая активная зона отдельно, чтобы
 * между разнесёнными зонами не оставалось видимой земли. Без ограничения —
 * один кусок на всю карту.
 */
export function getSceneZoneBounds(stage: RoomGameStage, size: SceneWorldSize): SceneBounds[] {
  const rects = getSceneActiveZoneRects(stage)
  if (!rects.length) return [mapRectToSceneBounds(getFullMapRect(size), size)]
  return rects.map((rect) => mapRectToSceneBounds(rect, size))
}

/**
 * Общая область сцены: по ней ходит камера и рисуется миникарта.
 * Без активных зон это вся карта.
 */
export function getSceneBounds(stage: RoomGameStage, size: SceneWorldSize): SceneBounds {
  const fullMap = getFullMapRect(size)
  if (!isActiveZoneViewRestricted(stage)) return mapRectToSceneBounds(fullMap, size)
  return mapRectToSceneBounds(getActiveZoneBounds() ?? fullMap, size)
}

/**
 * Гасит маску вне активных зон. Все слои (лес, здания, дороги, река, мосты)
 * извлекаются уже из неё, поэтому одного прохода хватает, чтобы вне зон вообще
 * ничего не построилось.
 */
export function clearMaskOutsideRects(parsedMask: ParsedColorMask, rects: SpawnRect[]) {
  if (!rects.length) return

  const { labels, width, height } = parsedMask
  const sampleStep = Math.max(1, Number(parsedMask.sampleStep) || 1)

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width
    const sourceY = y * sampleStep
    for (let x = 0; x < width; x += 1) {
      if (!labels[rowOffset + x]) continue
      if (isPointInsideAnyRect({ x: x * sampleStep, y: sourceY }, rects)) continue
      labels[rowOffset + x] = 0
    }
  }
}

/**
 * Подпись текущего ограничения. Сцена собирается один раз, поэтому по смене
 * подписи (стадия сменилась, админ поправил зоны) её нужно пересобрать.
 */
export function getSceneActiveZoneKey(stage: RoomGameStage): string {
  const rects = getSceneActiveZoneRects(stage)
  if (!rects.length) return 'full'
  return rects.map((r) => `${r.from.x},${r.from.y},${r.to.x},${r.to.y}`).join(';')
}
