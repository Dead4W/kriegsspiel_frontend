import { RoomGameStage } from '@/enums/roomStage.ts'
import { Team } from '@/enums/teamKeys.ts'
import { unitType } from '@/engine/units/types.ts'

export type DirectViewOrderUnitLike = {
  directView?: boolean
  type?: string
  team: Team | string
  isRetreat?: boolean
  roomMapUserId?: number
}

export function isUnitEligibleForDirectViewOrder(unit: DirectViewOrderUnitLike): boolean {
  return Boolean(unit.directView)
    && unit.type !== unitType.MESSENGER
    && unit.team === window.PLAYER.team
    && !unit.isRetreat
}

export function hasObjectsMapForDirectViewOrder(): boolean {
  return window.ROOM_WORLD.hasObjectNavMeshMap()
}

export function isPlayerDirectViewOrderContext(): boolean {
  return window.PLAYER.team !== Team.ADMIN
    && window.ROOM_WORLD.stage === RoomGameStage.WAR
    && hasObjectsMapForDirectViewOrder()
}

export function areUnitsEligibleForDirectViewOrder(units: DirectViewOrderUnitLike[]): boolean {
  if (!units.length) return false

  return units.every(isUnitEligibleForDirectViewOrder)
}

export function getUnitsEligibleForDirectViewOrder<T extends DirectViewOrderUnitLike>(units: T[]): T[] {
  return units.filter(isUnitEligibleForDirectViewOrder)
}

export function canPlayerUseDirectViewOrder(units: DirectViewOrderUnitLike[]): boolean {
  return isPlayerDirectViewOrderContext()
    && getUnitsEligibleForDirectViewOrder(units).length > 0
}
