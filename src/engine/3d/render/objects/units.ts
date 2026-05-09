import * as THREE from 'three'
import type { BaseUnit } from '@/engine/units/baseUnit'
import { CLIENT_SETTING_KEYS } from '@/enums/clientSettingsKeys'
import { ROOM_SETTING_KEYS } from '@/enums/roomSettingsKeys'
import type { WorldRenderContext } from '../types'
import {
  createAttackRenderState,
  disposeAttackVisuals,
  maybeEmitShotTracer,
  updateAttackVisuals,
  type AttackMode,
  type AttackShotRecord,
} from './units/attackTracers'
import {
  createFormationMesh,
  getOrCreateUnitFlagTexture,
  getVisualSignature,
  resolveFormationSlotPosition,
  resolveTeamColor,
  WHITE_FLAG_TEXTURE,
  type FormationLayout,
  type TeamId,
} from './units/formations'
import type { BuildingAnchor } from './buildings'
import { resolveHouseOccupancy, type UnitHouseBinding } from './units/building'
import {
  createForestPlacementLookup,
  hasForestEnvironment,
  resolveForestUnitWorldPosition,
  type ForestPlacementLookup,
} from './units/forest'

type UnitRenderRecord = {
  group: THREE.Group
  unitType: string
  count: number
  team: TeamId
  visualSignature: string
  bodyMaterial: THREE.MeshStandardMaterial
  headMaterial: THREE.MeshStandardMaterial
  limbMaterial: THREE.MeshStandardMaterial
  markerMaterial: THREE.MeshStandardMaterial
  flagRoot: THREE.Group
  flagCloth: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  flagMaterial: THREE.MeshBasicMaterial
  retreatFlagsRoot: THREE.Group
  retreatFlagCloths: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[]
  retreatFlagMaterial: THREE.MeshBasicMaterial
  barsRoot: THREE.Group
  hpBarFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  ammoBarFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  ammoBarBackground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  baseFlagY: number
  pulsePhase: number
  shotTimer: number
  attackSyncKey: string
  flagWavePhase: number
  layout: FormationLayout
} & AttackShotRecord

type VirtualHouseRecord = {
  group: THREE.Group
  body: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  roof: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
}

function resolveHpBarColor(hpRatio: number) {
  const clamped = THREE.MathUtils.clamp(hpRatio, 0, 1)
  const percent = Math.round(clamped * 100)
  if (percent <= 5) return 0xff2a2a
  if (clamped < 0.5) {
    const t = clamped / 0.5
    const r = 255
    const g = Math.round(42 + (224 - 42) * t)
    const b = Math.round(42 * (1 - t))
    return (r << 16) | (g << 8) | b
  }
  const t = (clamped - 0.5) / 0.5
  const r = Math.round(255 + (34 - 255) * t)
  const g = Math.round(224 + (255 - 224) * t)
  const b = Math.round(0 + (85 - 0) * t)
  return (r << 16) | (g << 8) | b
}

function hashString01(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function resolveRenderFormation(baseFormation: string, inForest: boolean) {
  const normalized = String(baseFormation || '').trim().toLowerCase()
  const isDefault = normalized.length === 0 || normalized === 'default'
  if (inForest && isDefault) return 'forestdefault'
  return baseFormation
}

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) {
      for (let i = 0; i < mat.length; i += 1) mat[i]!.dispose()
    } else {
      mat?.dispose()
    }
  })
}

export class UnitsLayerRenderer {
  private readonly root = new THREE.Group()
  private readonly houseTintRoot = new THREE.Group()
  private readonly virtualHouseRoot = new THREE.Group()
  private readonly tracerRoot = new THREE.Group()
  private readonly projectileRoot = new THREE.Group()
  private readonly effectsRoot = new THREE.Group()
  private readonly records = new Map<string, UnitRenderRecord>()
  private readonly houseTintOverlays = new Map<string, THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>>()
  private readonly virtualHouses = new Map<string, VirtualHouseRecord>()
  private buildingAnchors: BuildingAnchor[] = []
  private forestPlacement: ForestPlacementLookup | null = null
  private readonly attackState = createAttackRenderState()
  private readonly flagLookAtScratch = new THREE.Vector3()
  private readonly parentWorldQuatScratch = new THREE.Quaternion()
  private readonly cameraQuatScratch = new THREE.Quaternion()

  constructor(private readonly context: WorldRenderContext) {
    this.root.name = 'units-layer'
    this.houseTintRoot.name = 'units-house-tint-layer'
    this.virtualHouseRoot.name = 'units-virtual-houses-layer'
    this.tracerRoot.name = 'units-tracers-layer'
    this.projectileRoot.name = 'units-projectiles-layer'
    this.effectsRoot.name = 'units-effects-layer'
    this.context.scene.add(this.root)
    this.context.scene.add(this.houseTintRoot)
    this.context.scene.add(this.virtualHouseRoot)
    this.context.scene.add(this.tracerRoot)
    this.context.scene.add(this.projectileRoot)
    this.context.scene.add(this.effectsRoot)
  }

  update(
    units: BaseUnit[],
    elapsedSeconds: number,
    deltaSeconds: number,
    camera: THREE.PerspectiveCamera
  ) {
    const aliveIds = new Set<string>()
    const unitsById = new Map<string, BaseUnit>()
    const mapHalfWidth = this.context.world.width * 0.5
    const mapHalfHeight = this.context.world.height * 0.5
    const metersPerPixel = this.context.world.cellSize
    const houseBindings = resolveHouseOccupancy(
      units,
      this.buildingAnchors,
      mapHalfWidth,
      mapHalfHeight,
      metersPerPixel
    )
    const resolvedUnitWorldPositions = new Map<string, { x: number; z: number }>()

    // Build lookup for the whole frame first, so shot targeting does not
    // depend on iteration order (teams/units stay independent).
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i]!
      unitsById.set(unit.id, unit)
    }

    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i]!
      const hp = Number(unit.hp)
      if (!Number.isFinite(hp) || hp <= 0) continue

      const count = Math.ceil(hp)
      const team = unit.team
      const id = unit.id
      const unitType = unit.type
      const formation = unit.getFormation()
      const isForestUnit = hasForestEnvironment(unit)
      const renderFormation = resolveRenderFormation(formation, isForestUnit)
      aliveIds.add(id)

      const existing = this.records.get(id)
      const visualSignature = getVisualSignature(renderFormation)
      if (
        !existing
        || existing.count !== count
        || existing.team !== team
        || existing.unitType !== unitType
        || existing.visualSignature !== visualSignature
      ) {
        if (existing) {
          this.disposeRecord(existing)
        }
        const visual = createFormationMesh(count, team, this.context.world.objectSize, renderFormation)
        this.root.add(visual.group)
        this.records.set(id, {
          group: visual.group,
          unitType,
          count,
          team,
          visualSignature: visual.visualSignature,
          flagRoot: visual.flagRoot,
          flagCloth: visual.flagCloth,
          flagMaterial: visual.flagMaterial,
          retreatFlagsRoot: visual.retreatFlagsRoot,
          retreatFlagCloths: visual.retreatFlagCloths,
          retreatFlagMaterial: visual.retreatFlagMaterial,
          barsRoot: visual.barsRoot,
          hpBarFill: visual.hpBarFill,
          ammoBarFill: visual.ammoBarFill,
          ammoBarBackground: visual.ammoBarBackground,
          baseFlagY: visual.baseFlagY,
          bodyMaterial: visual.bodyMaterial,
          headMaterial: visual.headMaterial,
          limbMaterial: visual.limbMaterial,
          markerMaterial: visual.markerMaterial,
          pulsePhase: hashString01(id) * Math.PI * 2,
          shotTimer: 0,
          attackSyncKey: '',
          flagWavePhase: hashString01(`${id}:flag`) * Math.PI * 2,
          layout: visual.layout,
        })
      }

      const record = this.records.get(id)!
      const houseBinding = houseBindings.get(id)
      const isInsideHouse = Boolean(houseBinding)
      const forestPosition = !houseBinding && this.forestPlacement && hasForestEnvironment(unit)
        ? resolveForestUnitWorldPosition({
          unit,
          lookup: this.forestPlacement,
          mapHalfWidth,
          mapHalfHeight,
          metersPerPixel,
        })
        : null
      const worldX = houseBinding
        ? houseBinding.anchor.x
        : (forestPosition?.x ?? (unit.pos.x - mapHalfWidth) * metersPerPixel)
      const worldZ = houseBinding
        ? houseBinding.anchor.z
        : (forestPosition?.z ?? (unit.pos.y - mapHalfHeight) * metersPerPixel)
      resolvedUnitWorldPositions.set(id, { x: worldX, z: worldZ })
      record.group.position.set(
        worldX,
        this.context.world.objectSize * 0.05,
        worldZ
      )
      record.group.rotation.set(0, -unit.angle, 0)
      record.group.visible = true
      const isRetreat = unit.isRetreat
      record.bodyMaterial.visible = !isInsideHouse
      record.headMaterial.visible = !isInsideHouse
      record.limbMaterial.visible = !isInsideHouse
      record.markerMaterial.visible = !isInsideHouse
      record.flagMaterial.map = isRetreat
        ? WHITE_FLAG_TEXTURE
        : getOrCreateUnitFlagTexture(record.unitType, record.team)
      record.flagMaterial.color.setHex(0xffffff)
      record.flagRoot.visible = !isRetreat
      record.retreatFlagsRoot.visible = isRetreat
      record.flagMaterial.needsUpdate = true
      this.updateFlagFacingAndWave(record, camera, elapsedSeconds, isRetreat)
      this.updateUnitBars(record, unit, isRetreat || isInsideHouse)
      const attackMode = this.maybeEmitShotTracer(
        unit,
        unitsById,
        record,
        deltaSeconds,
        houseBindings,
        resolvedUnitWorldPositions
      )
      this.animateRecord(record, elapsedSeconds, attackMode)
    }

    this.updateVirtualHouses(houseBindings)
    this.updateHouseTintOverlays(houseBindings)

    for (const [id, record] of this.records) {
      if (aliveIds.has(id)) continue
      this.disposeRecord(record)
      this.records.delete(id)
    }
    updateAttackVisuals({
      state: this.attackState,
      deltaSeconds,
      worldObjectSize: this.context.world.objectSize,
      resolveTeamColor,
      tracerRoot: this.tracerRoot,
      projectileRoot: this.projectileRoot,
      effectsRoot: this.effectsRoot,
    })
  }

  dispose() {
    for (const [, record] of this.records) {
      this.disposeRecord(record)
    }
    this.records.clear()
    this.disposeHouseTintOverlays()
    this.disposeVirtualHouses()
    disposeAttackVisuals({
      state: this.attackState,
      tracerRoot: this.tracerRoot,
      projectileRoot: this.projectileRoot,
      effectsRoot: this.effectsRoot,
    })
    this.context.scene.remove(this.root)
    this.context.scene.remove(this.houseTintRoot)
    this.context.scene.remove(this.virtualHouseRoot)
    this.context.scene.remove(this.tracerRoot)
    this.context.scene.remove(this.projectileRoot)
    this.context.scene.remove(this.effectsRoot)
  }

  setBuildingAnchors(anchors: BuildingAnchor[]) {
    this.buildingAnchors = anchors
  }

  setForestPoints(forestPoints: Array<[number, number]>, treePoints: Array<[number, number]>) {
    this.forestPlacement = createForestPlacementLookup(forestPoints, treePoints)
  }

  private animateRecord(record: UnitRenderRecord, elapsedSeconds: number, attackMode: AttackMode) {
    const isDirectAttack = attackMode === 'direct'
    const isArtilleryAttack = attackMode === 'artillery'
    const attackBoost = isArtilleryAttack ? 0.09 : (isDirectAttack ? 0.05 : 0)
    const pulse = 0.5 + 0.5 * Math.sin(elapsedSeconds * 3.1 + record.pulsePhase)
    const artilleryPulse = isArtilleryAttack
      ? 0.5 + 0.5 * Math.sin(elapsedSeconds * 6.2 + record.pulsePhase * 1.37)
      : 0
    record.bodyMaterial.emissiveIntensity = 0.07 + pulse * 0.08 + attackBoost + artilleryPulse * 0.03
    record.headMaterial.emissiveIntensity = 0.08 + pulse * 0.1 + attackBoost * 0.9 + artilleryPulse * 0.04
    record.markerMaterial.emissiveIntensity =
      0.11 + pulse * 0.14 + attackBoost * 1.6 + artilleryPulse * (isArtilleryAttack ? 0.15 : 0)
  }

  private updateFlagFacingAndWave(
    record: UnitRenderRecord,
    camera: THREE.PerspectiveCamera,
    elapsedSeconds: number,
    isRetreat: boolean
  ) {
    record.group.getWorldQuaternion(this.parentWorldQuatScratch)
    this.cameraQuatScratch.copy(camera.quaternion)
    this.parentWorldQuatScratch.invert()
    record.flagRoot.quaternion.copy(this.cameraQuatScratch.premultiply(this.parentWorldQuatScratch))
    record.retreatFlagsRoot.quaternion.identity()

    const waveSpeed = 10.5
    const wave = Math.sin(elapsedSeconds * waveSpeed + record.flagWavePhase)
    record.flagCloth.rotation.z = 0
    record.flagCloth.position.y = record.baseFlagY + this.context.world.objectSize * 0.42
    if (isRetreat) {
      for (let i = 0; i < record.retreatFlagCloths.length; i += 1) {
        const cloth = record.retreatFlagCloths[i]!
        const localWave = Math.sin(elapsedSeconds * (11.5 + i * 0.7) + record.flagWavePhase + i * 0.9)
        cloth.rotation.z = localWave * 0.32
      }
    }
  }

  private updateUnitBars(record: UnitRenderRecord, unit: BaseUnit, isRetreat: boolean) {
    const showBars = Boolean(window.CLIENT_SETTINGS?.[CLIENT_SETTING_KEYS.SHOW_HP_UNIT_ON_MAP]) && !isRetreat
    record.barsRoot.visible = showBars
    if (!showBars) return

    const maxHp = Math.max(1, Number(unit.stats.maxHp) || 1)
    const hpRatio = THREE.MathUtils.clamp((Number(unit.hp) || 0) / maxHp, 0, 1)
    record.hpBarFill.scale.x = hpRatio
    record.hpBarFill.position.x = (hpRatio - 1) * record.hpBarFill.geometry.parameters.width * 0.5
    record.hpBarFill.material.color.setHex(resolveHpBarColor(hpRatio))

    const limitedAmmo = Boolean(window.ROOM_SETTINGS?.[ROOM_SETTING_KEYS.LIMITED_AMMO])
    record.ammoBarBackground.visible = limitedAmmo
    record.ammoBarFill.visible = limitedAmmo
    if (!limitedAmmo) return

    const ammoMax = Math.max(1, Number(unit.stats.ammoMax) || 1)
    const ammoRatio = THREE.MathUtils.clamp((Number(unit.ammo) || 0) / ammoMax, 0, 1)
    record.ammoBarFill.scale.x = ammoRatio
    record.ammoBarFill.position.x = (ammoRatio - 1) * record.ammoBarFill.geometry.parameters.width * 0.5
  }

  private updateHouseTintOverlays(bindings: Map<string, UnitHouseBinding>) {
    const aliveAnchorIds = new Set<string>()
    for (const [, binding] of bindings) {
      const anchor = binding.anchor
      if (anchor.isVirtual) continue
      aliveAnchorIds.add(anchor.id)
      let overlay = this.houseTintOverlays.get(anchor.id)
      if (!overlay) {
        const geometry = new THREE.BoxGeometry(anchor.footprintX * 1.02, anchor.bodyHeight * 1.03, anchor.footprintZ * 1.02)
        const material = new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: anchor.isVirtual ? 0.52 : 0.36,
          depthWrite: false,
        })
        overlay = new THREE.Mesh(geometry, material)
        overlay.position.set(anchor.x, anchor.bodyHeight * 0.5 + this.context.world.objectSize * 0.02, anchor.z)
        this.houseTintRoot.add(overlay)
        this.houseTintOverlays.set(anchor.id, overlay)
      }
      overlay.material.color.setHex(resolveTeamColor(binding.unit.team))
      overlay.material.opacity = 0.36
    }

    for (const [anchorId, overlay] of this.houseTintOverlays) {
      if (aliveAnchorIds.has(anchorId)) continue
      this.houseTintRoot.remove(overlay)
      overlay.geometry.dispose()
      overlay.material.dispose()
      this.houseTintOverlays.delete(anchorId)
    }
  }

  private disposeHouseTintOverlays() {
    for (const [, overlay] of this.houseTintOverlays) {
      this.houseTintRoot.remove(overlay)
      overlay.geometry.dispose()
      overlay.material.dispose()
    }
    this.houseTintOverlays.clear()
  }

  private updateVirtualHouses(bindings: Map<string, UnitHouseBinding>) {
    const aliveVirtualIds = new Set<string>()
    for (const [, binding] of bindings) {
      const anchor = binding.anchor
      if (!anchor.isVirtual) continue
      aliveVirtualIds.add(anchor.id)
      let record = this.virtualHouses.get(anchor.id)
      if (!record) {
        record = this.createVirtualHouse(anchor)
        this.virtualHouses.set(anchor.id, record)
        this.virtualHouseRoot.add(record.group)
      }
      const roofHeight = Math.max(this.context.world.objectSize * 0.36, anchor.bodyHeight * 0.2)
      record.group.position.set(anchor.x, 0, anchor.z)
      record.body.scale.set(anchor.footprintX, anchor.bodyHeight, anchor.footprintZ)
      record.body.position.set(0, anchor.bodyHeight * 0.5, 0)
      record.roof.scale.set(anchor.footprintX * 1.08, roofHeight, anchor.footprintZ * 1.08)
      record.roof.position.set(0, anchor.bodyHeight + roofHeight * 0.5, 0)
    }
    for (const [anchorId, record] of this.virtualHouses) {
      if (aliveVirtualIds.has(anchorId)) continue
      this.virtualHouseRoot.remove(record.group)
      this.disposeVirtualHouse(record)
      this.virtualHouses.delete(anchorId)
    }
  }

  private createVirtualHouse(anchor: BuildingAnchor): VirtualHouseRecord {
    const group = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x8e8a82,
        roughness: 0.84,
        metalness: 0.02,
      })
    )
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x595f66,
        roughness: 0.92,
        metalness: 0.0,
      })
    )
    body.castShadow = true
    body.receiveShadow = true
    roof.castShadow = true
    roof.receiveShadow = true
    group.add(body)
    group.add(roof)
    group.position.set(anchor.x, 0, anchor.z)
    return { group, body, roof }
  }

  private disposeVirtualHouse(record: VirtualHouseRecord) {
    record.body.geometry.dispose()
    record.body.material.dispose()
    record.roof.geometry.dispose()
    record.roof.material.dispose()
  }

  private disposeVirtualHouses() {
    for (const [, record] of this.virtualHouses) {
      this.virtualHouseRoot.remove(record.group)
      this.disposeVirtualHouse(record)
    }
    this.virtualHouses.clear()
  }

  private disposeRecord(record: UnitRenderRecord) {
    this.root.remove(record.group)
    disposeObject3D(record.group)
  }

  private maybeEmitShotTracer(
    unit: BaseUnit,
    unitsById: Map<string, BaseUnit>,
    record: UnitRenderRecord,
    deltaSeconds: number,
    houseBindings: Map<string, UnitHouseBinding>,
    resolvedUnitWorldPositions: Map<string, { x: number; z: number }>
  ): AttackMode {
    const mapHalfWidth = this.context.world.width * 0.5
    const mapHalfHeight = this.context.world.height * 0.5
    const metersPerPixel = this.context.world.cellSize
    return maybeEmitShotTracer({
      state: this.attackState,
      unit,
      unitsById,
      record,
      records: this.records,
      world: {
        width: this.context.world.width,
        height: this.context.world.height,
        cellSize: this.context.world.cellSize,
        objectSize: this.context.world.objectSize,
      },
      deltaSeconds,
      resolveFormationSlotPosition,
      resolveTeamColor,
      tracerRoot: this.tracerRoot,
      projectileRoot: this.projectileRoot,
      hashString01,
      resolveUnitWorldBase: (sourceUnit, y) => {
        const houseBinding = houseBindings.get(sourceUnit.id)
        if (houseBinding) {
          return new THREE.Vector3(
            houseBinding.anchor.x,
            Math.max(y, this.context.world.objectSize * 0.55),
            houseBinding.anchor.z
          )
        }
        const resolvedPosition = resolvedUnitWorldPositions.get(sourceUnit.id)
        if (resolvedPosition) {
          return new THREE.Vector3(resolvedPosition.x, y, resolvedPosition.z)
        }
        return new THREE.Vector3(
          (sourceUnit.pos.x - mapHalfWidth) * metersPerPixel,
          y,
          (sourceUnit.pos.y - mapHalfHeight) * metersPerPixel
        )
      },
      resolveShotPointOverride: ({ unit: sourceUnit, fallback, toward }) => {
        const houseBinding = houseBindings.get(sourceUnit.id)
        if (!houseBinding) return fallback
        const centerX = houseBinding.anchor.x
        const centerZ = houseBinding.anchor.z
        const halfX = Math.max(0.2, houseBinding.anchor.footprintX * 0.5)
        const halfZ = Math.max(0.2, houseBinding.anchor.footprintZ * 0.5)
        const targetX = toward?.x ?? centerX
        const targetZ = toward?.z ?? centerZ
        const dx = targetX - centerX
        const dz = targetZ - centerZ
        const span = Math.hypot(dx, dz)
        if (span <= 1e-4) {
          return new THREE.Vector3(
            centerX,
            Math.max(this.context.world.objectSize * 0.55, houseBinding.anchor.bodyHeight * 0.55),
            centerZ
          )
        }
        const tx = Math.abs(dx) > 1e-4 ? halfX / Math.abs(dx) : Number.POSITIVE_INFINITY
        const tz = Math.abs(dz) > 1e-4 ? halfZ / Math.abs(dz) : Number.POSITIVE_INFINITY
        const edgeFactor = Math.min(tx, tz)
        const edgeX = centerX + dx * edgeFactor
        const edgeZ = centerZ + dz * edgeFactor
        return new THREE.Vector3(
          edgeX,
          Math.max(this.context.world.objectSize * 0.55, houseBinding.anchor.bodyHeight * 0.55),
          edgeZ
        )
      },
    })
  }
}

export function createUnitsLayer(context: WorldRenderContext) {
  return new UnitsLayerRenderer(context)
}