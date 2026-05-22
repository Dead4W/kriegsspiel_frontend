import { RoomGameStage } from '@/enums/roomStage.ts'
import { Team } from '@/enums/teamKeys.ts'

export type DirectViewOrderUnitLike = {
  directView?: boolean
  team: Team | string
  isRetreat?: boolean
  roomMapUserId?: number
}

export function hasObjectsMapForDirectViewOrder(): boolean {
  return Boolean(
    window.ROOM_WORLD.objectMapImageData
    && window.ROOM_WORLD.objectMapColorToEntity.size > 0
  )
}

export function isPlayerDirectViewOrderContext(): boolean {
  return window.PLAYER.team !== Team.ADMIN
    && window.ROOM_WORLD.stage === RoomGameStage.WAR
    && hasObjectsMapForDirectViewOrder()
}

export function areUnitsEligibleForDirectViewOrder(units: DirectViewOrderUnitLike[]): boolean {
  if (!units.length) return false
  const playerId = window.ROOM_WORLD.roomMapUserId ?? window.PLAYER.id ?? null
  if (playerId == null) return false

  return units.every((unit) => (
    Boolean(unit.directView)
    && unit.team === window.PLAYER.team
    && !unit.isRetreat
    && unit.roomMapUserId === playerId
  ))
}

export function canPlayerUseDirectViewOrder(units: DirectViewOrderUnitLike[]): boolean {
  return isPlayerDirectViewOrderContext() && areUnitsEligibleForDirectViewOrder(units)
}
