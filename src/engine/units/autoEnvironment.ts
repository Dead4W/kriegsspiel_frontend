import type { BaseUnit } from "@/engine/units/baseUnit.ts";
import { getEnvironmentStates } from "@/engine/resourcePack/environment.ts";
import { getFormationTypes } from "@/engine/resourcePack/formations.ts";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes.ts";
import type { MoveCommandState } from "@/engine/units/commands/moveCommand.ts";

export const NEAR_OBJECT_DISTANCE_METERS = 50

type EnvMode = "moving" | "standing"

const OBJECT_ENV_PRIORITIES: Record<EnvMode, Array<{ entities: string[]; envIds: string[] }>> = {
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
  ],
  moving: [
    {
      entities: ["good_road"],
      envIds: ["on_good_road", "in_good_road"],
    },
    {
      entities: ["road"],
      envIds: ["on_road", "in_road"],
    },
    {
      entities: ["forest"],
      envIds: ["in_forest"],
    },
    {
      entities: ["water", "river"],
      envIds: ["in_water", "on_water", "in_river"],
    },
  ],
}

const MOVING_DEFAULT_FIELD_ENV_IDS = ["in_field", "in_plain_field", "in_soft_field", "field"]

function isObjectMapReady(): boolean {
  return Boolean(window.ROOM_WORLD.objectMapImageData && window.ROOM_WORLD.objectMapColorToEntity.size > 0)
}

function getNearRadiusPx(): number {
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

function hasNearbyEntity(unit: BaseUnit, entities: string[], radiusPx: number): boolean {
  if (radiusPx <= 0) return false
  return Boolean(window.ROOM_WORLD.findNearestObjectPoint(unit.pos, entities, radiusPx))
}

function setEnvironmentState(unit: BaseUnit, environment: string | null) {
  const next = environment ? [environment] : []
  const sameLength = unit.envState.length === next.length
  const sameValues = sameLength && unit.envState.every((state, idx) => state === next[idx])
  if (sameValues) return
  unit.envState = next
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

  const nearBridge = isMoving && hasNearbyEntity(unit, ["bridge"], radiusPx)
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
    setEnvironmentState(unit, unit.manualEnvironment)
    applyBridgeFormation(unit, mode === "moving", getNearRadiusPx())
    return false
  }

  const firstMoveModifier = getFirstMoveCommandModifier(unit)
  if (firstMoveModifier) {
    setEnvironmentState(unit, firstMoveModifier)
    applyBridgeFormation(unit, mode === "moving", getNearRadiusPx())
    return false
  }

  if (!isObjectMapReady()) {
    applyBridgeFormation(unit, false, 0)
    return false
  }

  const radiusPx = getNearRadiusPx()
  const priorities = OBJECT_ENV_PRIORITIES[mode]
  let nextEnvironment: string | null = null

  for (const priority of priorities) {
    if (!hasNearbyEntity(unit, priority.entities, radiusPx)) continue
    nextEnvironment = resolveEnvironmentId(priority.envIds)
    if (nextEnvironment) break
  }
  if (mode === "moving" && !nextEnvironment) {
    nextEnvironment = resolveEnvironmentId(MOVING_DEFAULT_FIELD_ENV_IDS)
  }

  setEnvironmentState(unit, nextEnvironment)
  applyBridgeFormation(unit, mode === "moving", radiusPx)
  return true
}
