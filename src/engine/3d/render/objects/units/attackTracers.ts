import * as THREE from 'three'
import type { BaseUnit } from '@/engine/units/baseUnit'
import { UnitCommandTypes } from '@/engine/units/enums/UnitCommandTypes'
import { computeInaccuracyRadius } from '@/engine/units/modifiers/UnitInaccuracyModifier'
import { getInaccuracyAbility } from '@/engine/resourcePack/abilities'
import type { AttackCommandState } from '@/engine/units/commands/attackCommand'
import type { FormationLayout, TeamId } from './formations'

const SHOT_FREQUENCY_MULTIPLIER = 0.05
const SHOT_FREQUENCY_MULTIPLIER_ARTILLERY = 0.03
const ARTILLERY_SPEED_MULTIPLIER = 3

export type AttackMode = 'none' | 'direct' | 'artillery'

export type AttackIntent =
  | {
    mode: 'direct'
    target: BaseUnit
  }
  | {
    mode: 'artillery'
    center: THREE.Vector3
    radius: number
  }

export type ShotSyncRecord = {
  shotTimer: number
  attackSyncKey: string
  team: TeamId
}

export type AttackShotRecord = ShotSyncRecord & {
  count: number
  layout: FormationLayout
}

type WorldMetrics = {
  width: number
  height: number
  cellSize: number
  objectSize: number
}

type FormationSlotResolver = (
  index: number,
  count: number,
  layout: FormationLayout,
  y: number,
  target: THREE.Vector3
) => void

type TracerRecord = {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  material: THREE.LineBasicMaterial
  positions: Float32Array
  from: THREE.Vector3
  to: THREE.Vector3
  age: number
  duration: number
  lengthRatio: number
}

type ArcProjectileRecord = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  material: THREE.MeshStandardMaterial
  trail: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  trailMaterial: THREE.LineBasicMaterial
  trailPositions: Float32Array
  trailSamples: number
  from: THREE.Vector3
  control: THREE.Vector3
  to: THREE.Vector3
  pathLength: number
  age: number
  progress: number
  initialSpeed: number
  minSpeed: number
  speedDecayRate: number
  trailLength: number
  team: TeamId
}

type ExplosionRecord = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  material: THREE.MeshBasicMaterial
  age: number
  duration: number
  baseScale: number
  maxOpacity: number
}

export type AttackRenderState = {
  tracers: TracerRecord[]
  projectiles: ArcProjectileRecord[]
  explosions: ExplosionRecord[]
  tracerScratchA: THREE.Vector3
  tracerScratchB: THREE.Vector3
  projectileScratchA: THREE.Vector3
  projectileScratchB: THREE.Vector3
  projectileScratchC: THREE.Vector3
  impactScratch: THREE.Vector3
  slotScratch: THREE.Vector3
}

export function createAttackRenderState(): AttackRenderState {
  return {
    tracers: [],
    projectiles: [],
    explosions: [],
    tracerScratchA: new THREE.Vector3(),
    tracerScratchB: new THREE.Vector3(),
    projectileScratchA: new THREE.Vector3(),
    projectileScratchB: new THREE.Vector3(),
    projectileScratchC: new THREE.Vector3(),
    impactScratch: new THREE.Vector3(),
    slotScratch: new THREE.Vector3(),
  }
}

type EmitShotTracerParams<TRecord extends AttackShotRecord> = {
  state: AttackRenderState
  unit: BaseUnit
  unitsById: Map<string, BaseUnit>
  record: TRecord
  records: Map<string, TRecord>
  world: WorldMetrics
  deltaSeconds: number
  resolveFormationSlotPosition: FormationSlotResolver
  resolveTeamColor: (team: TeamId) => number
  tracerRoot: THREE.Group
  projectileRoot: THREE.Group
  hashString01: (value: string) => number
  resolveUnitWorldBase: (unit: BaseUnit, y: number) => THREE.Vector3
  resolveShotPointOverride?: (params: {
    unit: BaseUnit
    record: TRecord | null
    fallback: THREE.Vector3
    toward: THREE.Vector3 | null
    world: WorldMetrics
  }) => THREE.Vector3 | null
}

export function maybeEmitShotTracer<TRecord extends AttackShotRecord>(
  params: EmitShotTracerParams<TRecord>
): AttackMode {
  const {
    state,
    unit,
    unitsById,
    record,
    records,
    world,
    deltaSeconds,
    resolveFormationSlotPosition,
    resolveTeamColor,
    tracerRoot,
    projectileRoot,
    hashString01,
    resolveUnitWorldBase,
    resolveShotPointOverride,
  } = params
  const attackIntent = resolveAttackTarget(unit, unitsById, world)
  if (!attackIntent) {
    record.shotTimer = 0
    record.attackSyncKey = ''
    return 'none'
  }
  const attackSyncKey = resolveAttackSyncKey(attackIntent)
  if (record.attackSyncKey !== attackSyncKey) {
    record.attackSyncKey = attackSyncKey
    record.shotTimer = hashString01(`${unit.id}:${attackSyncKey}`)
  }
  const unitHp = Math.max(0, Number(unit.hp) || 0)
  const typeDamage = Math.max(0, Number(unit.stats.damage) || 0)
  const shotFrequencyMultiplier =
    attackIntent.mode === 'artillery' ? SHOT_FREQUENCY_MULTIPLIER_ARTILLERY : SHOT_FREQUENCY_MULTIPLIER
  const shotsPerSecond = typeDamage * unitHp * shotFrequencyMultiplier
  record.shotTimer += deltaSeconds * shotsPerSecond
  if (record.shotTimer < 1) return attackIntent.mode
  record.shotTimer -= 1

  let from = resolveShotWorldPoint(
    state,
    world,
    resolveFormationSlotPosition,
    resolveUnitWorldBase,
    unit,
    record,
    world.objectSize * 0.95,
    1.85
  )
  let to: THREE.Vector3
  if (attackIntent.mode === 'artillery') {
    to = resolveRandomImpactPoint(state, world.objectSize, attackIntent.center, attackIntent.radius)
    from = resolveShotPointOverride?.({
      unit,
      record,
      fallback: from,
      toward: to,
      world,
    }) ?? from
  } else {
    const targetRecord = records.get(attackIntent.target.id)
    to =
      targetRecord != null
        ? resolveShotWorldPoint(
          state,
          world,
          resolveFormationSlotPosition,
          resolveUnitWorldBase,
          attackIntent.target,
          targetRecord,
          world.objectSize * 0.95,
          1.8
        )
        : resolveUnitWorldBase(attackIntent.target, world.objectSize * 1.5)
    from = resolveShotPointOverride?.({
      unit,
      record,
      fallback: from,
      toward: to,
      world,
    }) ?? from
    to = resolveShotPointOverride?.({
      unit: attackIntent.target,
      record: targetRecord ?? null,
      fallback: to,
      toward: from,
      world,
    }) ?? to
  }
  const distance = from.distanceTo(to)
  if (distance >= 0.001) {
    if (attackIntent.mode === 'artillery') {
      spawnArcProjectile(
        state,
        world.objectSize,
        resolveTeamColor,
        tracerRoot,
        projectileRoot,
        from,
        to,
        record.team
      )
    } else {
      spawnTracer(state, world.objectSize, resolveTeamColor, tracerRoot, from, to, record.team)
    }
  }
  return attackIntent.mode
}

type AttackVisualsUpdateParams = {
  state: AttackRenderState
  deltaSeconds: number
  worldObjectSize: number
  resolveTeamColor: (team: TeamId) => number
  tracerRoot: THREE.Group
  projectileRoot: THREE.Group
  effectsRoot: THREE.Group
}

export function updateAttackVisuals(params: AttackVisualsUpdateParams) {
  updateTracers(params.state, params.deltaSeconds, params.tracerRoot)
  updateProjectiles(
    params.state,
    params.deltaSeconds,
    params.worldObjectSize,
    params.resolveTeamColor,
    params.tracerRoot,
    params.projectileRoot,
    params.effectsRoot
  )
  updateExplosions(params.state, params.deltaSeconds, params.effectsRoot)
}

type DisposeAttackVisualsParams = {
  state: AttackRenderState
  tracerRoot: THREE.Group
  projectileRoot: THREE.Group
  effectsRoot: THREE.Group
}

export function disposeAttackVisuals(params: DisposeAttackVisualsParams) {
  for (let i = params.state.tracers.length - 1; i >= 0; i -= 1) {
    removeTracer(params.state, params.tracerRoot, i)
  }
  for (let i = params.state.projectiles.length - 1; i >= 0; i -= 1) {
    removeProjectile(params.state, params.projectileRoot, params.tracerRoot, i)
  }
  for (let i = params.state.explosions.length - 1; i >= 0; i -= 1) {
    removeExplosion(params.state, params.effectsRoot, i)
  }
}

function resolveAttackSyncKey(attackIntent: AttackIntent) {
  if (attackIntent.mode === 'direct') return `direct:${attackIntent.target.id}`
  const cx = Math.round(attackIntent.center.x * 10)
  const cz = Math.round(attackIntent.center.z * 10)
  const r = Math.round(attackIntent.radius * 10)
  return `artillery:${cx}:${cz}:${r}`
}

function resolveAttackTarget(
  unit: BaseUnit,
  unitsById: Map<string, BaseUnit>,
  world: WorldMetrics
): AttackIntent | null {
  if (unit.isRetreat) return null
  const commands = unit.getCommands()
  for (let i = 0; i < commands.length; i += 1) {
    const command = commands[i] as any
    if (command.type !== UnitCommandTypes.Attack) continue
    const state = command.getState?.().state as AttackCommandState | undefined
    const inaccuracyPoint = state?.inaccuracyPoint
    if (inaccuracyPoint) {
      const activeAbilities = (state.abilities ?? []).filter((ability) => unit.abilities.includes(ability))
      const inaccuracyAbility = getInaccuracyAbility(activeAbilities)
      if (inaccuracyAbility) {
        const radiusMeters =
          computeInaccuracyRadius(unit, inaccuracyPoint)
          * (state.radiusModifier ?? 1)
          * inaccuracyAbility.radiusMult
        const center = worldPointToWorld(world, inaccuracyPoint.x, inaccuracyPoint.y, world.objectSize * 0.2)
        return {
          mode: 'artillery',
          center,
          radius: Math.max(0, radiusMeters),
        }
      }
    }
    const targetIds = state?.targets ?? []
    const candidates: BaseUnit[] = []
    for (let t = 0; t < targetIds.length; t += 1) {
      const candidate = unitsById.get(targetIds[t]!)
      if (!candidate) continue
      if (!candidate.alive) continue
      if (candidate.isRetreat) continue
      if (candidate.team === unit.team) continue
      candidates.push(candidate)
    }
    if (!candidates.length) continue
    const randomIndex = Math.floor(Math.random() * candidates.length)
    return {
      mode: 'direct',
      target: candidates[randomIndex]!,
    }
  }
  return null
}

function worldPointToWorld(world: WorldMetrics, x: number, y: number, worldY: number) {
  const mapHalfWidth = world.width * 0.5
  const mapHalfHeight = world.height * 0.5
  const metersPerPixel = world.cellSize
  return new THREE.Vector3(
    (x - mapHalfWidth) * metersPerPixel,
    worldY,
    (y - mapHalfHeight) * metersPerPixel
  )
}

function unitToWorld(world: WorldMetrics, unit: BaseUnit, y: number) {
  const mapHalfWidth = world.width * 0.5
  const mapHalfHeight = world.height * 0.5
  const metersPerPixel = world.cellSize
  return new THREE.Vector3(
    (unit.pos.x - mapHalfWidth) * metersPerPixel,
    y,
    (unit.pos.y - mapHalfHeight) * metersPerPixel
  )
}

function resolveShotWorldPoint(
  state: AttackRenderState,
  world: WorldMetrics,
  resolveFormationSlotPosition: FormationSlotResolver,
  resolveUnitWorldBase: (unit: BaseUnit, y: number) => THREE.Vector3,
  unit: BaseUnit,
  record: AttackShotRecord,
  y: number,
  jitterScale: number
) {
  const slotIndex = Math.floor(Math.random() * Math.max(1, record.count))
  resolveFormationSlotPosition(slotIndex, record.count, record.layout, y, state.slotScratch)
  state.slotScratch.x += (Math.random() - 0.5) * record.layout.columnSpacing * 0.35 * jitterScale
  state.slotScratch.z += (Math.random() - 0.5) * record.layout.rowSpacing * 0.35 * jitterScale
  state.slotScratch.y += (Math.random() - 0.5) * world.objectSize * 0.22
  state.slotScratch.applyEuler(new THREE.Euler(0, -unit.angle, 0))
  const base = resolveUnitWorldBase(unit, 0)
  state.slotScratch.add(base)
  return state.slotScratch.clone()
}

function resolveRandomImpactPoint(
  state: AttackRenderState,
  objectSize: number,
  center: THREE.Vector3,
  radius: number
) {
  const angle = Math.random() * Math.PI * 2
  const dist = Math.sqrt(Math.random()) * Math.max(0, radius)
  state.impactScratch.copy(center)
  state.impactScratch.x += Math.cos(angle) * dist
  state.impactScratch.z += Math.sin(angle) * dist
  state.impactScratch.y += (Math.random() - 0.5) * objectSize * 0.18
  return state.impactScratch.clone()
}

function spawnTracer(
  state: AttackRenderState,
  objectSize: number,
  resolveTeamColor: (team: TeamId) => number,
  tracerRoot: THREE.Group,
  from: THREE.Vector3,
  to: THREE.Vector3,
  team: TeamId
) {
  const positions = new Float32Array(6)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.LineBasicMaterial({
    color: resolveTeamColor(team),
    transparent: false,
    opacity: 1,
    depthWrite: false,
  })
  const line = new THREE.Line(geometry, material)
  line.frustumCulled = false
  tracerRoot.add(line)

  const distance = from.distanceTo(to)
  const speed = Math.max(40, objectSize * 180)
  const duration = THREE.MathUtils.clamp(distance / speed, 0.06, 0.22)
  state.tracers.push({
    line,
    material,
    positions,
    from: from.clone(),
    to: to.clone(),
    age: 0,
    duration,
    lengthRatio: 0.24,
  })
}

function updateTracers(state: AttackRenderState, deltaSeconds: number, tracerRoot: THREE.Group) {
  for (let i = state.tracers.length - 1; i >= 0; i -= 1) {
    const tracer = state.tracers[i]!
    tracer.age += deltaSeconds
    const headT = tracer.age / tracer.duration
    if (headT >= 1) {
      removeTracer(state, tracerRoot, i)
      continue
    }
    const tailT = Math.max(0, headT - tracer.lengthRatio)
    state.tracerScratchA.copy(tracer.from).lerp(tracer.to, tailT)
    state.tracerScratchB.copy(tracer.from).lerp(tracer.to, headT)
    const positions = tracer.positions
    positions[0] = state.tracerScratchA.x
    positions[1] = state.tracerScratchA.y
    positions[2] = state.tracerScratchA.z
    positions[3] = state.tracerScratchB.x
    positions[4] = state.tracerScratchB.y
    positions[5] = state.tracerScratchB.z
    const attribute = tracer.line.geometry.getAttribute('position') as THREE.BufferAttribute
    attribute.needsUpdate = true
  }
}

function removeTracer(state: AttackRenderState, tracerRoot: THREE.Group, index: number) {
  const tracer = state.tracers[index]
  if (!tracer) return
  tracerRoot.remove(tracer.line)
  tracer.line.geometry.dispose()
  tracer.material.dispose()
  state.tracers.splice(index, 1)
}

function spawnArcProjectile(
  state: AttackRenderState,
  objectSize: number,
  resolveTeamColor: (team: TeamId) => number,
  tracerRoot: THREE.Group,
  projectileRoot: THREE.Group,
  from: THREE.Vector3,
  to: THREE.Vector3,
  team: TeamId
) {
  const distance = from.distanceTo(to)
  const colorHex = resolveTeamColor(team)
  const material = new THREE.MeshStandardMaterial({
    color: 0xf7f1d8,
    emissive: colorHex,
    emissiveIntensity: 0.78,
    roughness: 0.34,
    metalness: 0.02,
    transparent: true,
    opacity: 0.92,
  })
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(objectSize * 0.2, 10, 10),
    material
  )
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.position.copy(from)
  projectileRoot.add(mesh)

  const trailSamples = 9
  const trailPositions = new Float32Array(trailSamples * 3)
  for (let i = 0; i < trailSamples; i += 1) {
    const offset = i * 3
    trailPositions[offset] = from.x
    trailPositions[offset + 1] = from.y
    trailPositions[offset + 2] = from.z
  }
  const trailGeometry = new THREE.BufferGeometry()
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3))
  const trailMaterial = new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const trail = new THREE.Line(trailGeometry, trailMaterial)
  trail.frustumCulled = false
  tracerRoot.add(trail)

  const control = from.clone().add(to).multiplyScalar(0.5)
  const arcHeight = objectSize * 8.4 + distance * 0.51
  control.y += arcHeight
  control.x += (Math.random() - 0.5) * objectSize * 1.6
  control.z += (Math.random() - 0.5) * objectSize * 1.6
  const pathLength = estimateQuadraticBezierLength(state, from, control, to)
  const baseSpeed = objectSize * 180 * ARTILLERY_SPEED_MULTIPLIER
  const initialSpeed = baseSpeed * 2.1
  const minSpeed = baseSpeed * 0.65
  const speedDecayRate = 2.35

  state.projectiles.push({
    mesh,
    material,
    trail,
    trailMaterial,
    trailPositions,
    trailSamples,
    from: from.clone(),
    control,
    to: to.clone(),
    pathLength,
    age: 0,
    progress: 0,
    initialSpeed,
    minSpeed,
    speedDecayRate,
    trailLength: 0.1,
    team,
  })
}

function estimateQuadraticBezierLength(
  state: AttackRenderState,
  from: THREE.Vector3,
  control: THREE.Vector3,
  to: THREE.Vector3
) {
  const segments = 12
  let length = 0
  sampleQuadraticBezier(from, control, to, 0, state.projectileScratchA)
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments
    sampleQuadraticBezier(from, control, to, t, state.projectileScratchB)
    length += state.projectileScratchA.distanceTo(state.projectileScratchB)
    state.projectileScratchA.copy(state.projectileScratchB)
  }
  return Math.max(0.001, length)
}

function computeArtilleryFlightDecay(ageSeconds: number) {
  const fadeDelay = 0.12
  const fadedAge = Math.max(0, ageSeconds - fadeDelay)
  return THREE.MathUtils.clamp(Math.exp(-fadedAge * 1.35), 0.18, 1)
}

function computeArtilleryProjectileSpeed(projectile: ArcProjectileRecord) {
  const slowed = projectile.initialSpeed * Math.exp(-projectile.speedDecayRate * projectile.age)
  return Math.max(projectile.minSpeed, slowed)
}

function sampleQuadraticBezier(
  from: THREE.Vector3,
  control: THREE.Vector3,
  to: THREE.Vector3,
  t: number,
  out: THREE.Vector3
) {
  const clampedT = THREE.MathUtils.clamp(t, 0, 1)
  const invT = 1 - clampedT
  out.set(
    invT * invT * from.x + 2 * invT * clampedT * control.x + clampedT * clampedT * to.x,
    invT * invT * from.y + 2 * invT * clampedT * control.y + clampedT * clampedT * to.y,
    invT * invT * from.z + 2 * invT * clampedT * control.z + clampedT * clampedT * to.z
  )
  return out
}

function spawnExplosion(
  state: AttackRenderState,
  worldObjectSize: number,
  resolveTeamColor: (team: TeamId) => number,
  effectsRoot: THREE.Group,
  point: THREE.Vector3,
  team: TeamId,
  flightDecay: number
) {
  const material = new THREE.MeshBasicMaterial({
    color: resolveTeamColor(team),
    transparent: true,
    opacity: 0.85 * flightDecay,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(worldObjectSize * 0.45, 8, 8),
    material
  )
  mesh.position.copy(point)
  mesh.position.y += worldObjectSize * 0.22
  mesh.scale.setScalar(0.4)
  effectsRoot.add(mesh)
  state.explosions.push({
    mesh,
    material,
    age: 0,
    duration: THREE.MathUtils.lerp(0.18, 0.34, flightDecay),
    baseScale: worldObjectSize * THREE.MathUtils.lerp(0.78, 1.6, flightDecay),
    maxOpacity: THREE.MathUtils.lerp(0.2, 0.85, flightDecay),
  })
}

function updateProjectiles(
  state: AttackRenderState,
  deltaSeconds: number,
  worldObjectSize: number,
  resolveTeamColor: (team: TeamId) => number,
  tracerRoot: THREE.Group,
  projectileRoot: THREE.Group,
  effectsRoot: THREE.Group
) {
  for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = state.projectiles[i]!
    projectile.age += deltaSeconds
    const speed = computeArtilleryProjectileSpeed(projectile)
    projectile.progress += (speed * deltaSeconds) / projectile.pathLength
    const t = THREE.MathUtils.clamp(projectile.progress, 0, 1)
    if (t >= 1) {
      spawnExplosion(
        state,
        worldObjectSize,
        resolveTeamColor,
        effectsRoot,
        projectile.to,
        projectile.team,
        computeArtilleryFlightDecay(projectile.age)
      )
      removeProjectile(state, projectileRoot, tracerRoot, i)
      continue
    }
    sampleQuadraticBezier(projectile.from, projectile.control, projectile.to, t, state.projectileScratchA)
    const trailTailT = Math.max(0, t - projectile.trailLength)
    sampleQuadraticBezier(
      projectile.from,
      projectile.control,
      projectile.to,
      trailTailT,
      state.projectileScratchB
    )

    projectile.mesh.position.copy(state.projectileScratchA)
    projectile.mesh.rotation.y += deltaSeconds * 6.5
    const flightDecay = computeArtilleryFlightDecay(projectile.age)
    projectile.material.emissiveIntensity = 0.78 * flightDecay * (1 - t * 0.2)
    projectile.material.opacity = THREE.MathUtils.clamp(
      0.92 * flightDecay * (1 - t * 0.15),
      0.2,
      1
    )

    const positions = projectile.trailPositions
    const sampleCount = projectile.trailSamples
    const sampleDivisor = Math.max(1, sampleCount - 1)
    for (let s = 0; s < sampleCount; s += 1) {
      const sampleOffset = s * 3
      const k = s / sampleDivisor
      const sampleT = THREE.MathUtils.lerp(trailTailT, t, k)
      sampleQuadraticBezier(
        projectile.from,
        projectile.control,
        projectile.to,
        sampleT,
        state.projectileScratchC
      )
      positions[sampleOffset] = state.projectileScratchC.x
      positions[sampleOffset + 1] = state.projectileScratchC.y
      positions[sampleOffset + 2] = state.projectileScratchC.z
    }
    const attribute = projectile.trail.geometry.getAttribute('position') as THREE.BufferAttribute
    attribute.needsUpdate = true
    projectile.trailMaterial.opacity = THREE.MathUtils.clamp(
      0.86 * flightDecay * (1 - t * 0.35),
      0.14,
      0.95
    )
  }
}

function removeProjectile(
  state: AttackRenderState,
  projectileRoot: THREE.Group,
  tracerRoot: THREE.Group,
  index: number
) {
  const projectile = state.projectiles[index]
  if (!projectile) return
  projectileRoot.remove(projectile.mesh)
  tracerRoot.remove(projectile.trail)
  projectile.mesh.geometry.dispose()
  projectile.material.dispose()
  projectile.trail.geometry.dispose()
  projectile.trailMaterial.dispose()
  state.projectiles.splice(index, 1)
}

function updateExplosions(state: AttackRenderState, deltaSeconds: number, effectsRoot: THREE.Group) {
  for (let i = state.explosions.length - 1; i >= 0; i -= 1) {
    const explosion = state.explosions[i]!
    explosion.age += deltaSeconds
    const t = explosion.age / explosion.duration
    if (t >= 1) {
      removeExplosion(state, effectsRoot, i)
      continue
    }
    const scale = explosion.baseScale * (0.35 + t * 0.9)
    explosion.mesh.scale.setScalar(scale)
    explosion.material.opacity = (1 - t) * explosion.maxOpacity
  }
}

function removeExplosion(state: AttackRenderState, effectsRoot: THREE.Group, index: number) {
  const explosion = state.explosions[index]
  if (!explosion) return
  effectsRoot.remove(explosion.mesh)
  explosion.mesh.geometry.dispose()
  explosion.material.dispose()
  state.explosions.splice(index, 1)
}
