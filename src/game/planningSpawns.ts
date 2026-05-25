import { RoomGameStage } from '@/enums/roomStage'
import { Team } from '@/enums/teamKeys'
import type { unitstate } from '@/engine/units/types'

type Point = { x: number; y: number }

export type SpawnRect = {
  from: Point
  to: Point
}

type TeamSettings = {
  spawns?: unknown
}

type RoomParamsSettings = {
  activeZones?: unknown
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function toPoint(value: unknown): Point | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const x = toFiniteNumber(record.x)
  const y = toFiniteNumber(record.y)
  if (x == null || y == null) return null
  return { x, y }
}

function normalizeRect(value: unknown): SpawnRect | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const from = toPoint(record.from)
  const to = toPoint(record.to)
  if (!from || !to) return null
  return {
    from: {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
    },
    to: {
      x: Math.max(from.x, to.x),
      y: Math.max(from.y, to.y),
    },
  }
}

function getPerTeamSettings(): Record<string, TeamSettings> {
  const fromSettings = window.ROOM_SETTINGS?.perTeamSettings
  if (fromSettings && typeof fromSettings === 'object') {
    return fromSettings as Record<string, TeamSettings>
  }
  const fromParams = window.ROOM_PARAMS?.perTeamSettings
  if (fromParams && typeof fromParams === 'object') {
    return fromParams as Record<string, TeamSettings>
  }
  return {}
}

export function getTeamSpawnRects(team: string): SpawnRect[] {
  if (team !== Team.RED && team !== Team.BLUE) return []
  const perTeamSettings = getPerTeamSettings()
  const rawSpawns = perTeamSettings[team]?.spawns
  if (!Array.isArray(rawSpawns)) return []
  return rawSpawns
    .map(normalizeRect)
    .filter((rect): rect is SpawnRect => rect !== null)
}

export function isPointInsideSpawnRect(pos: Point, rect: SpawnRect): boolean {
  return (
    pos.x >= rect.from.x
    && pos.x <= rect.to.x
    && pos.y >= rect.from.y
    && pos.y <= rect.to.y
  )
}

function getRoomParamsSource(): RoomParamsSettings {
  const fromParams = window.ROOM_PARAMS
  if (fromParams && typeof fromParams === 'object') {
    return fromParams as RoomParamsSettings
  }
  const fromSettings = window.ROOM_SETTINGS as Record<string, unknown>
  if (fromSettings && typeof fromSettings === 'object') {
    return fromSettings as RoomParamsSettings
  }
  return {}
}

export function getActiveZoneRects(): SpawnRect[] {
  const source = getRoomParamsSource()
  const rawActiveZones = source.activeZones
  if (!Array.isArray(rawActiveZones)) return []
  return rawActiveZones
    .map(normalizeRect)
    .filter((rect): rect is SpawnRect => rect !== null)
}

export function isPointInsideAnyRect(pos: Point, rects: SpawnRect[]): boolean {
  return rects.some((rect) => isPointInsideSpawnRect(pos, rect))
}

export function isPointInsideActiveZone(pos: Point): boolean {
  const zones = getActiveZoneRects()
  if (!zones.length) return true
  return isPointInsideAnyRect(pos, zones)
}

export function isPlanningTeamSpawnPointAllowed(team: string, pos: Point): boolean {
  if (!isPointInsideActiveZone(pos)) return false
  if (window.ROOM_WORLD.stage !== RoomGameStage.PLANNING) return true
  const zones = getTeamSpawnRects(team)
  if (!zones.length) return true
  return isPointInsideAnyRect(pos, zones)
}

function getTeamUnitLimitsSource(): Record<string, Record<string, unknown>> {
  const fromSettings = (window.ROOM_SETTINGS as Record<string, unknown>)?.teamUnitLimits
  if (fromSettings && typeof fromSettings === 'object') {
    return fromSettings as Record<string, Record<string, unknown>>
  }
  const fromParams = (window.ROOM_PARAMS as Record<string, unknown>)?.teamUnitLimits
  if (fromParams && typeof fromParams === 'object') {
    return fromParams as Record<string, Record<string, unknown>>
  }
  return {}
}

function normalizePositiveIntOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const n = Math.floor(value)
  if (n <= 0) return null
  return n
}

function getTeamTypeLimit(team: string, unitType: string): number | null | undefined {
  const source = getTeamUnitLimitsSource()
  const teamLimits = source[team]
  if (!teamLimits || typeof teamLimits !== 'object') return undefined
  if (!(unitType in teamLimits)) return undefined
  return normalizePositiveIntOrNull(teamLimits[unitType])
}

function buildTeamTypeUsageCounters(extraStates: unitstate[] = []): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {
    [Team.RED]: {},
    [Team.BLUE]: {},
  }

  const pushUnit = (team: string, unitType: string) => {
    if (team !== Team.RED && team !== Team.BLUE) return
    if (!unitType) return
    const teamKey: Team.RED | Team.BLUE = team
    const teamUsage = (result[teamKey] ??= {})
    teamUsage[unitType] = (teamUsage[unitType] || 0) + 1
  }

  for (const unit of window.ROOM_WORLD.units.list()) {
    pushUnit(unit.team, unit.type)
  }
  for (const state of extraStates) {
    pushUnit(state.team, state.type)
  }

  return result
}

export function isTeamUnitTypeSpawnAllowed(team: string, unitType: string, extraStates: unitstate[] = []): boolean {
  if (team !== Team.RED && team !== Team.BLUE) return true
  const limit = getTeamTypeLimit(team, unitType)
  if (limit === undefined) return true
  if (limit === null) return false

  const usage = buildTeamTypeUsageCounters(extraStates)
  const used = usage[team]?.[unitType] || 0
  return used < limit
}
