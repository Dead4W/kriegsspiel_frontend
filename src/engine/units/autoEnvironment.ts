import type { BaseUnit } from "@/engine/units/baseUnit.ts";
import type { vec2 } from "@/engine/types.ts";
import { getEnvironmentStates, hasEnvironmentStateTag } from "@/engine/resourcePack/environment.ts";
import { getFormationTypes } from "@/engine/resourcePack/formations.ts";
import { hasUnitTypeTag } from "@/engine/resourcePack/units.ts";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes.ts";
import type { MoveCommandState } from "@/engine/units/commands/moveCommand.ts";

export const NEAR_OBJECT_DISTANCE_METERS = 50

export type EnvMode = "moving" | "standing"

/** Answers whether any of these object-map entities lies near a position. */
export type NearbyEntityOracle = (entities: string[]) => boolean

type ObjectEnvironmentPriority = { entities: string[]; envIds: string[] }

const ROAD_OBJECT_ENV_PRIORITIES: ObjectEnvironmentPriority[] = [
  {
    entities: ["good_road", "bridge"],
    envIds: ["on_good_road", "in_good_road"],
  },
  {
    entities: ["road"],
    envIds: ["on_road", "in_road"],
  },
]

const OBJECT_ENV_PRIORITIES: Record<EnvMode, ObjectEnvironmentPriority[]> = {
  standing: [
    {
      entities: ["cover_house", "fortified_house", "fortified_building"],
      envIds: ["in_cover_house", "in_fortified_house"],
    },
    {
      entities: ["house", "building", "red_building"],
      envIds: ["in_house", "in_building"],
    },
    {
      entities: ["forest"],
      envIds: ["in_forest"],
    },
    ...ROAD_OBJECT_ENV_PRIORITIES,
    {
      entities: ["water", "river"],
      envIds: ["in_water", "on_water", "in_river"],
    },
  ],
  moving: [
    ...ROAD_OBJECT_ENV_PRIORITIES,
    {
      entities: ["water", "river"],
      envIds: ["in_water", "on_water", "in_river"],
    },
    {
      entities: ["forest"],
      envIds: ["in_forest"],
    },
  ],
}

const MOVING_DEFAULT_FIELD_ENV_IDS = ["in_field", "in_plain_field", "in_soft_field", "field"]

export function isObjectMapReady(): boolean {
  return window.ROOM_WORLD.hasObjectNavMeshMap()
}

export function getNearRadiusPx(): number {
  const metersPerPixel = window.ROOM_WORLD.map.metersPerPixel
  if (!metersPerPixel || metersPerPixel <= 0) return 0
  return Math.max(1, Math.round(NEAR_OBJECT_DISTANCE_METERS / metersPerPixel))
}

function resolveEnvironmentId(envCandidates: string[]): string | null {
  const available = new Set(getEnvironmentStates().map((state) => String(state.id)))
  for (const id of envCandidates) {
    if (available.has(id)) return id
  }
  return null
}

function hasNearbyEntityAt(pos: vec2, entities: string[], radiusPx: number): boolean {
  if (radiusPx <= 0) return false
  return Boolean(window.ROOM_WORLD.findNearestObjectPoint(pos, entities, radiusPx))
}

function resolveNearbyEnvironmentAt(
  pos: vec2,
  priorities: ObjectEnvironmentPriority[],
  radiusPx: number,
): string | null {
  return resolvePriorityEnvironment(
    priorities,
    (entities) => hasNearbyEntityAt(pos, entities, radiusPx),
  )
}

function resolvePriorityEnvironment(
  priorities: ObjectEnvironmentPriority[],
  hasNearby: NearbyEntityOracle,
): string | null {
  for (const priority of priorities) {
    if (!hasNearby(priority.entities)) continue
    const environment = resolveEnvironmentId(priority.envIds)
    if (environment) return environment
  }
  return null
}

/**
 * The environment a unit would be in at some position, given only an answer to
 * "is any of these near it".
 *
 * Separated from `applyAutoEnvironment` so that the same priority table can be
 * asked about ground nobody is standing on. The oracle is the caller's, because
 * asking the object map per position is affordable for one unit and ruinous for
 * a whole raster of them.
 */
export function resolveEnvironmentForMode(
  mode: EnvMode,
  hasNearby: NearbyEntityOracle,
): string | null {
  const environment = resolvePriorityEnvironment(OBJECT_ENV_PRIORITIES[mode], hasNearby)
  if (environment) return environment
  // A unit on the march is in open field when it is in nothing else; a unit
  // standing still is simply in nothing.
  return mode === "moving" ? resolveEnvironmentId(MOVING_DEFAULT_FIELD_ENV_IDS) : null
}

/**
 * The environment the object map would put a unit in at `pos`, whether or not
 * anyone stands there. The move estimate asks it about ground ahead of a unit.
 */
export function resolveEnvironmentAtPosition(pos: vec2, mode: EnvMode): string | null {
  const radiusPx = getNearRadiusPx()
  return resolveEnvironmentForMode(mode, (entities) => hasNearbyEntityAt(pos, entities, radiusPx))
}

/** Every object-map entity the environment rules can react to. */
export function getEnvironmentRelevantEntities(): string[] {
  const entities = new Set<string>()
  for (const priorities of Object.values(OBJECT_ENV_PRIORITIES)) {
    for (const priority of priorities) {
      for (const entity of priority.entities) entities.add(entity)
    }
  }
  return [...entities]
}

function setEnvironmentState(unit: BaseUnit, environment: string | null) {
  const next = environment ? [environment] : []
  const sameLength = unit.envState.length === next.length
  const sameValues = sameLength && unit.envState.every((state, idx) => state === next[idx])
  if (sameValues) return
  unit.envState = next
  unit.setDirty()
}

function applyWaterEnvironmentPenalty(unit: BaseUnit, environment: string | null) {
  if (!environment) return
  if (unit.hasInWater) return
  if (!hasEnvironmentStateTag(environment, "is_water")) return
  if (!hasUnitTypeTag(unit.type, "cant_swim")) return
  unit.hp = unit.hp / 2
  unit.hasInWater = true
  unit.setDirty()
}

function getFirstMoveCommandModifier(unit: BaseUnit): string | null {
  for (const command of unit.getCommands()) {
    if (command.type !== UnitCommandTypes.Move) continue
    const moveState = command.getState().state as MoveCommandState
    const modifier = typeof moveState.modifier === "string" ? moveState.modifier.trim() : ""
    return modifier || null
  }
  return null
}

export function hasAutoBridgeFormation(unit: BaseUnit): boolean {
  return (unit as BaseUnit & {
    __autoBridgePrevFormation?: string | null
  }).__autoBridgePrevFormation != null
}

function applyBridgeFormation(unit: BaseUnit, isMoving: boolean, radiusPx: number) {
  const unitWithAutoBridgeState = unit as BaseUnit & {
    __autoBridgePrevFormation?: string | null
  }
  const previousFormation = unitWithAutoBridgeState.__autoBridgePrevFormation ?? null

  const columnFormation = getFormationTypes().includes("column") ? "column" : null
  if (!columnFormation || radiusPx <= 0) {
    if (previousFormation != null) {
      unitWithAutoBridgeState.__autoBridgePrevFormation = null
      if (unit.getFormation() !== previousFormation) {
        unit.setFormation(previousFormation)
      }
    }
    return
  }

  const nearBridge = isMoving && hasNearbyEntityAt(unit.pos, ["bridge"], radiusPx)
  if (nearBridge) {
    if (previousFormation == null && unit.getFormation() !== columnFormation) {
      unitWithAutoBridgeState.__autoBridgePrevFormation = unit.getFormation()
      unit.setFormation(columnFormation)
    }
    return
  }

  if (previousFormation != null) {
    unitWithAutoBridgeState.__autoBridgePrevFormation = null
    if (unit.getFormation() !== previousFormation) {
      unit.setFormation(previousFormation)
    }
  }
}

export function applyAutoEnvironment(unit: BaseUnit, mode: EnvMode): boolean {
  if (unit.manualEnvironment) {
    applyWaterEnvironmentPenalty(unit, unit.manualEnvironment)
    setEnvironmentState(unit, unit.manualEnvironment)
    applyBridgeFormation(unit, mode === "moving", getNearRadiusPx())
    return false
  }

  const firstMoveModifier = getFirstMoveCommandModifier(unit)
  if (firstMoveModifier) {
    const radiusPx = getNearRadiusPx()
    const nearbyRoadEnvironment = (
      hasEnvironmentStateTag(firstMoveModifier, "is_water")
      && isObjectMapReady()
    )
      ? resolveNearbyEnvironmentAt(unit.pos, ROAD_OBJECT_ENV_PRIORITIES, radiusPx)
      : null
    const nextEnvironment = nearbyRoadEnvironment ?? firstMoveModifier
    applyWaterEnvironmentPenalty(unit, nextEnvironment)
    setEnvironmentState(unit, nextEnvironment)
    applyBridgeFormation(unit, mode === "moving", radiusPx)
    return false
  }

  if (!isObjectMapReady()) {
    applyBridgeFormation(unit, false, 0)
    return false
  }

  const radiusPx = getNearRadiusPx()
  const nextEnvironment = resolveEnvironmentAtPosition(unit.pos, mode)

  applyWaterEnvironmentPenalty(unit, nextEnvironment)
  setEnvironmentState(unit, nextEnvironment)
  applyBridgeFormation(unit, mode === "moving", radiusPx)
  return true
}
