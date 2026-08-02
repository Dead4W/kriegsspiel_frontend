import type { vec2 } from "@/engine/types.ts";
import type { BaseUnit } from "@/engine/units/baseUnit.ts";
import type { UnitAbilityType } from "@/engine/units/modifiers/UnitAbilityModifiers.ts";
import type { EnvironmentStateId } from "@/engine/resourcePack/environment.ts";
import { getResourcePack } from "@/engine/assets/resourcepack.ts";
import { clamp } from "@/engine/math.ts";
import { getFatigueConfig } from "@/engine/resourcePack/fatigue.ts";
import { fatigueDelta } from "@/engine/units/fatigue.ts";
import {
  getNearRadiusPx,
  isObjectMapReady,
  resolveEnvironmentAtPosition,
} from "@/engine/units/autoEnvironment.ts";
import { ROOM_SETTING_KEYS } from "@/enums/roomSettingsKeys.ts";

export interface MoveEstimateInput {
  startPos: vec2
  target: vec2
  modifier: string | null
  abilities: UnitAbilityType[]
}

/**
 * Ground answers are kept on a grid of this fraction of the object-map lookup
 * radius: within one cell the answer can hardly differ, and a coarse grid is
 * what lets a marching unit — and the unit behind it — reuse what was already
 * read off the map.
 */
const GROUND_CELL_RADIUS_FRACTION = 0.5
/** Ceiling on map reads for one leg, however long it is. */
const MAX_GROUND_SAMPLES = 48
/** Tiredness climbs over hours, so slicing a march finer than this buys nothing. */
const MAX_SLICE_SECONDS = 300
const MAX_SLICES = 4096
/** Both caches are dropped whole once they outgrow this, which only costs the work again. */
const GROUND_CACHE_LIMIT = 50000
const ESTIMATE_CACHE_LIMIT = 4096

const groundEnvironmentByCell = new Map<string, EnvironmentStateId | null>()
const secondsByEstimateKey = new Map<string, number>()
let cachedWorld: unknown = null
let cachedNavMesh: unknown = null
let cachedResourcePack: unknown = null

/**
 * Both caches answer questions about one board and one resource pack, so they
 * only hold for as long as the ones they were filled from.
 */
function dropCachesOnWorldChange() {
  const worldInstance: unknown = window.ROOM_WORLD ?? null
  const navMesh: unknown = window.ROOM_WORLD?.objectNavMeshMap ?? null
  const resourcePack: unknown = getResourcePack()
  if (
    worldInstance === cachedWorld
    && navMesh === cachedNavMesh
    && resourcePack === cachedResourcePack
  ) return
  cachedWorld = worldInstance
  cachedNavMesh = navMesh
  cachedResourcePack = resourcePack
  groundEnvironmentByCell.clear()
  secondsByEstimateKey.clear()
}

function groundEnvironmentAt(x: number, y: number, cellPx: number): EnvironmentStateId | null {
  const cellX = Math.floor(x / cellPx)
  const cellY = Math.floor(y / cellPx)
  const key = `${cellPx}:${cellX}:${cellY}`
  const cached = groundEnvironmentByCell.get(key)
  if (cached !== undefined) return cached

  const environment = resolveEnvironmentAtPosition(
    { x: (cellX + 0.5) * cellPx, y: (cellY + 0.5) * cellPx },
    "moving",
  )
  if (groundEnvironmentByCell.size >= GROUND_CACHE_LIMIT) groundEnvironmentByCell.clear()
  groundEnvironmentByCell.set(key, environment)
  return environment
}

type MarchEnvironment =
  /** One state for the whole way. */
  | { kind: "fixed"; environment: EnvironmentStateId | null }
  /** Nothing overrides and nothing to read: whatever the unit carries stands. */
  | { kind: "unitOwn" }
  /** Decided by the ground under the unit, step by step. */
  | { kind: "ground" }

/** Mirrors what a move command puts on the unit before every step it takes. */
function planMarchEnvironment(unit: BaseUnit, modifier: string | null): MarchEnvironment {
  if (unit.manualEnvironment) return { kind: "fixed", environment: unit.manualEnvironment }
  if (modifier) return { kind: "fixed", environment: modifier }
  if (isObjectMapReady()) return { kind: "ground" }
  return { kind: "unitOwn" }
}

/** The ability a move command would have running, which is its last usable one. */
function pickActiveAbility(unit: BaseUnit, abilities: UnitAbilityType[]): UnitAbilityType | null {
  let active: UnitAbilityType | null = null
  for (const ability of abilities) {
    if (unit.abilities.includes(ability)) active = ability
  }
  return active
}

function estimateCacheKey(unit: BaseUnit, input: MoveEstimateInput): string {
  return [
    unit.id,
    // Where the leg starts decides which ground it crosses, so the caller's
    // start point belongs in the key as much as the target does.
    Math.round(input.startPos.x),
    Math.round(input.startPos.y),
    Math.round(input.target.x),
    Math.round(input.target.y),
    input.modifier ?? "",
    input.abilities.join(","),
    unit.manualEnvironment ?? "",
    unit.envState.join(","),
    unit.getFormation(),
    Math.round(unit.fatigue * 100),
    window.ROOM_WORLD.map.metersPerPixel,
    // Anything else that scales the pace — stats, time of day, weather, the
    // speed a column is held to — is already visible in what the unit does now.
    Math.round(unit.speed * 1000),
    window.ROOM_SETTINGS[ROOM_SETTING_KEYS.FATIGUE] ? 1 : 0,
  ].join("|")
}

/**
 * How long a unit needs to walk from `startPos` to `target`.
 *
 * Walked through rather than divided out, because neither the pace nor the
 * ground holds still: the object map hands out an environment by where the unit
 * actually is, and a long march tires it as it goes, which costs speed again.
 */
export function estimateMoveSeconds(unit: BaseUnit, input: MoveEstimateInput): number {
  const distancePx = Math.hypot(
    input.target.x - input.startPos.x,
    input.target.y - input.startPos.y,
  )
  if (!(distancePx > 0)) return 0

  dropCachesOnWorldChange()

  const key = estimateCacheKey(unit, input)
  const cached = secondsByEstimateKey.get(key)
  if (cached !== undefined) return cached

  const seconds = simulateMarchSeconds(unit, input, distancePx)
  if (secondsByEstimateKey.size >= ESTIMATE_CACHE_LIMIT) secondsByEstimateKey.clear()
  secondsByEstimateKey.set(key, seconds)
  return seconds
}

function simulateMarchSeconds(
  unit: BaseUnit,
  input: MoveEstimateInput,
  distancePx: number,
): number {
  const metersPerPixel = Math.max(0.0001, Number(window.ROOM_WORLD.map.metersPerPixel) || 1)
  const marchEnvironment = planMarchEnvironment(unit, input.modifier)
  const fatigueEnabled = Boolean(window.ROOM_SETTINGS[ROOM_SETTING_KEYS.FATIGUE])
  const fatigueMax = getFatigueConfig().max

  // The unit is read as it would be mid-march and put back as it was. Fields are
  // set directly: a unit that is only being asked about must not go out as dirty.
  const heldEnvironment = unit.envState
  const heldAbility = unit.activeAbilityType
  const heldFatigue = unit.fatigue

  try {
    unit.activeAbilityType = pickActiveAbility(unit, input.abilities)
    if (marchEnvironment.kind === "fixed") {
      unit.envState = marchEnvironment.environment ? [marchEnvironment.environment] : []
    }

    const cellPx = Math.max(1, Math.round(getNearRadiusPx() * GROUND_CELL_RADIUS_FRACTION))
    const groundSamplePx = marchEnvironment.kind === "ground"
      ? Math.max(cellPx, distancePx / MAX_GROUND_SAMPLES)
      : Infinity
    const towardsX = (input.target.x - input.startPos.x) / distancePx
    const towardsY = (input.target.y - input.startPos.y) / distancePx

    let fatigue = unit.fatigue
    let travelledPx = 0
    let seconds = 0
    let speedPxPerSecond = 0

    for (let slice = 0; slice < MAX_SLICES && travelledPx < distancePx; slice += 1) {
      if (marchEnvironment.kind === "ground") {
        const groundEnvironment = groundEnvironmentAt(
          input.startPos.x + towardsX * travelledPx,
          input.startPos.y + towardsY * travelledPx,
          cellPx,
        )
        unit.envState = groundEnvironment ? [groundEnvironment] : []
      }
      unit.fatigue = fatigue

      speedPxPerSecond = unit.speed / 60 / metersPerPixel
      if (!(speedPxPerSecond > 0)) return Infinity

      const slicePx = Math.min(
        groundSamplePx,
        distancePx - travelledPx,
        fatigueEnabled ? speedPxPerSecond * MAX_SLICE_SECONDS : Infinity,
      )
      const sliceSeconds = slicePx / speedPxPerSecond
      seconds += sliceSeconds
      travelledPx += slicePx

      if (fatigueEnabled) {
        fatigue = clamp(
          fatigue + fatigueDelta(unit, sliceSeconds, {
            didMove: true,
            isAttacking: false,
            moveAbilityIds: input.abilities,
          }),
          0,
          fatigueMax,
        )
      }
    }

    // A crawl slow enough to run out of slices: the rest goes at the last pace.
    if (travelledPx < distancePx) {
      seconds += (distancePx - travelledPx) / speedPxPerSecond
    }

    return Math.ceil(seconds)
  } finally {
    unit.envState = heldEnvironment
    unit.activeAbilityType = heldAbility
    unit.fatigue = heldFatigue
  }
}
