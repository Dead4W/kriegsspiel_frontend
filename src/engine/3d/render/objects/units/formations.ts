import * as THREE from 'three'
import { createRetreatFlags } from './retreat'
import {
  createUnitUi,
  getOrCreateUnitFlagTexture as getOrCreateUnitFlagTextureUi,
  WHITE_FLAG_TEXTURE,
} from './ui'

export type TeamId = 'red' | 'blue' | 'neutral' | string

export type FormationLayout = {
  columns: number
  rows: number
  columnSpacing: number
  rowSpacing: number
  halfDepthSpan: number
}

type FormationProfile = {
  columnsFactor: number
  maxColumns: number
  columnSpacingMul: number
  rowSpacingMul: number
  forceMounted: boolean
  squareLayout: boolean
  slotJitterMul: number
}

export type FormationVisual = {
  group: THREE.Group
  visualSignature: string
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
  bodyMaterial: THREE.MeshStandardMaterial
  headMaterial: THREE.MeshStandardMaterial
  limbMaterial: THREE.MeshStandardMaterial
  markerMaterial: THREE.MeshStandardMaterial
  layout: FormationLayout
}

const TEAM_COLORS: Record<string, number> = {
  red: 0xef4444,
  blue: 0x3b82f6,
  neutral: 0x888888,
}

export function resolveTeamColor(team: TeamId) {
  return TEAM_COLORS[team] ?? TEAM_COLORS.neutral ?? 0x888888
}

function resolveTeamHeadColor(team: TeamId) {
  const color = new THREE.Color(resolveTeamColor(team))
  color.multiplyScalar(0.65)
  return color.getHex()
}

export function getOrCreateUnitFlagTexture(unitType: string, team: TeamId) {
  return getOrCreateUnitFlagTextureUi(unitType, team, resolveTeamColor)
}

export { WHITE_FLAG_TEXTURE }

function resolveFormationProfile(formation: string): FormationProfile {
  const key = String(formation || '').trim().toLowerCase()
  if (key === 'column') {
    return {
      columnsFactor: 0.62,
      maxColumns: 4,
      columnSpacingMul: 0.9,
      rowSpacingMul: 0.95,
      forceMounted: false,
      squareLayout: false,
      slotJitterMul: 0,
    }
  }
  if (key === 'springing') {
    return {
      columnsFactor: 1.28,
      maxColumns: 20,
      columnSpacingMul: 1.34,
      rowSpacingMul: 1.24,
      forceMounted: false,
      squareLayout: false,
      slotJitterMul: 0,
    }
  }
  if (key === 'kneelingvolley') {
    return {
      columnsFactor: 1.5,
      maxColumns: 24,
      columnSpacingMul: 1.14,
      rowSpacingMul: 0.78,
      forceMounted: false,
      squareLayout: false,
      slotJitterMul: 0,
    }
  }
  if (key === 'forcewalking') {
    return {
      columnsFactor: 0.86,
      maxColumns: 7,
      columnSpacingMul: 0.98,
      rowSpacingMul: 0.88,
      forceMounted: false,
      squareLayout: false,
      slotJitterMul: 0,
    }
  }
  if (key === 'onhorse') {
    return {
      columnsFactor: 1,
      maxColumns: 16,
      columnSpacingMul: 1,
      rowSpacingMul: 1,
      forceMounted: true,
      squareLayout: false,
      slotJitterMul: 0,
    }
  }
  if (key === 'forestdefault') {
    return {
      columnsFactor: 1,
      maxColumns: 24,
      columnSpacingMul: 1.3,
      rowSpacingMul: 1.28,
      forceMounted: false,
      squareLayout: true,
      slotJitterMul: 0.36,
    }
  }
  return {
    columnsFactor: 1,
    maxColumns: 16,
    columnSpacingMul: 1,
    rowSpacingMul: 1,
    forceMounted: false,
    squareLayout: false,
    slotJitterMul: 0,
  }
}

function buildFormationLayoutByProfile(
  count: number,
  objectSize: number,
  profile: FormationProfile
): FormationLayout {
  const columns = profile.squareLayout
    ? Math.max(1, Math.ceil(Math.sqrt(count)))
    : Math.max(1, Math.ceil(Math.sqrt(count * 3)))
  const adjustedColumns = THREE.MathUtils.clamp(
    Math.ceil(columns * profile.columnsFactor),
    1,
    Math.max(1, profile.maxColumns)
  )
  const adjustedRows = Math.max(1, Math.ceil(count / adjustedColumns))
  const columnSpacing = Math.max(objectSize * 1.8 * profile.columnSpacingMul, 1.65)
  const rowSpacing = Math.max(objectSize * 1.55 * profile.rowSpacingMul, 1.1)
  const halfDepthSpan = (adjustedRows - 1) * rowSpacing * 0.5
  return { columns: adjustedColumns, rows: adjustedRows, columnSpacing, rowSpacing, halfDepthSpan }
}

export function getVisualSignature(formation: string) {
  const profile = resolveFormationProfile(formation)
  return `primitive-v3:${String(formation || 'default').toLowerCase()}:${profile.forceMounted ? 'mounted' : 'foot'}`
}

function buildUnitVisualParams(objectSize: number, mounted: boolean) {
  if (!mounted) {
    return {
      bodyGeom: new THREE.BoxGeometry(objectSize * 0.56, objectSize * 0.9, objectSize * 0.34),
      headGeom: new THREE.BoxGeometry(objectSize * 0.34, objectSize * 0.34, objectSize * 0.3),
      limbGeom: new THREE.BoxGeometry(objectSize * 0.14, objectSize * 0.62, objectSize * 0.14),
      bodyY: objectSize * 0.84,
      headY: objectSize * 1.5,
      armY: objectSize * 0.84,
      legY: objectSize * 0.34,
      armXOffset: objectSize * 0.37,
      legXOffset: objectSize * 0.15,
      armZOffset: 0,
      legFrontZ: 0,
      legBackZ: 0,
    }
  }
  return {
    bodyGeom: new THREE.BoxGeometry(objectSize * 0.88, objectSize * 0.56, objectSize * 1.24),
    headGeom: new THREE.BoxGeometry(objectSize * 0.32, objectSize * 0.4, objectSize * 0.32),
    limbGeom: new THREE.BoxGeometry(objectSize * 0.16, objectSize * 0.62, objectSize * 0.16),
    bodyY: objectSize * 0.76,
    headY: objectSize * 1.46,
    armY: objectSize * 1.03,
    legY: objectSize * 0.35,
    armXOffset: objectSize * 0.19,
    legXOffset: objectSize * 0.28,
    armZOffset: objectSize * -0.2,
    legFrontZ: objectSize * 0.42,
    legBackZ: objectSize * -0.42,
  }
}

function hashIndex01(index: number, salt: number) {
  const value = Math.sin((index + 1) * (12.9898 + salt * 0.173) + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
}

export function resolveFormationSlotPosition(
  index: number,
  count: number,
  layout: FormationLayout,
  y: number,
  target: THREE.Vector3
) {
  const slot = Math.max(0, Math.min(count - 1, Math.floor(index)))
  const row = Math.floor(slot / layout.columns)
  const col = slot % layout.columns
  const unitsBeforeRow = row * layout.columns
  const unitsLeft = count - unitsBeforeRow
  const unitsInRow = Math.max(0, Math.min(layout.columns, unitsLeft))
  const rowFrontSpan = Math.max(0, (unitsInRow - 1) * layout.columnSpacing)
  const x = col * layout.columnSpacing - rowFrontSpan * 0.5
  const z = row * layout.rowSpacing - layout.halfDepthSpan
  target.set(x, y, z)
}

export function createFormationMesh(
  count: number,
  team: TeamId,
  objectSize: number,
  formation: string
): FormationVisual {
  const clampedCount = Math.max(1, Math.floor(count))
  const group = new THREE.Group()
  const profile = resolveFormationProfile(formation)
  const layout = buildFormationLayoutByProfile(clampedCount, objectSize, profile)
  const visualParams = buildUnitVisualParams(objectSize, profile.forceMounted)
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const bodyColor = new THREE.Color(resolveTeamColor(team)).lerp(new THREE.Color(0x6f7784), 0.55).getHex()
  const limbColor = new THREE.Color(resolveTeamColor(team)).lerp(new THREE.Color(0x3f4552), 0.72).getHex()
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: bodyColor,
    emissive: resolveTeamHeadColor(team),
    emissiveIntensity: 0.09,
    roughness: 0.74,
    metalness: 0.03,
  })
  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0xe1c5a0,
    emissive: resolveTeamHeadColor(team),
    emissiveIntensity: 0.1,
    roughness: 0.82,
    metalness: 0.02,
  })
  const limbMaterial = new THREE.MeshStandardMaterial({
    color: limbColor,
    emissive: resolveTeamHeadColor(team),
    emissiveIntensity: 0.05,
    roughness: 0.8,
    metalness: 0.02,
  })
  const body = new THREE.InstancedMesh(
    visualParams.bodyGeom,
    bodyMaterial,
    clampedCount
  )
  const head = new THREE.InstancedMesh(
    visualParams.headGeom,
    headMaterial,
    clampedCount
  )
  const armLeft = new THREE.InstancedMesh(
    visualParams.limbGeom,
    limbMaterial,
    clampedCount
  )
  const armRight = new THREE.InstancedMesh(
    visualParams.limbGeom,
    limbMaterial,
    clampedCount
  )
  const legLeft = new THREE.InstancedMesh(
    visualParams.limbGeom,
    limbMaterial,
    clampedCount
  )
  const legRight = new THREE.InstancedMesh(
    visualParams.limbGeom,
    limbMaterial,
    clampedCount
  )
  body.castShadow = true
  body.receiveShadow = true
  head.castShadow = true
  head.receiveShadow = true
  armLeft.castShadow = true
  armRight.castShadow = true
  legLeft.castShadow = true
  legRight.castShadow = true
  armLeft.receiveShadow = true
  armRight.receiveShadow = true
  legLeft.receiveShadow = true
  legRight.receiveShadow = true

  const bodyPosition = new THREE.Vector3()
  const headPosition = new THREE.Vector3()
  const armLeftPosition = new THREE.Vector3()
  const armRightPosition = new THREE.Vector3()
  const legLeftPosition = new THREE.Vector3()
  const legRightPosition = new THREE.Vector3()
  const slotJitterX = layout.columnSpacing * profile.slotJitterMul
  const slotJitterZ = layout.rowSpacing * profile.slotJitterMul
  const applyForestJitter = (slot: number, target: THREE.Vector3) => {
    if (profile.slotJitterMul <= 0) return
    const jitterX = (hashIndex01(slot, 7) - 0.5) * slotJitterX
    const jitterZ = (hashIndex01(slot, 19) - 0.5) * slotJitterZ
    target.x += jitterX
    target.z += jitterZ
  }
  for (let i = 0; i < clampedCount; i += 1) {
    resolveFormationSlotPosition(i, clampedCount, layout, visualParams.bodyY, bodyPosition)
    applyForestJitter(i, bodyPosition)
    matrix.compose(bodyPosition, quaternion, scale)
    body.setMatrixAt(i, matrix)

    resolveFormationSlotPosition(i, clampedCount, layout, visualParams.headY, headPosition)
    applyForestJitter(i, headPosition)
    headPosition.z += visualParams.armZOffset * 0.2
    matrix.compose(headPosition, quaternion, scale)
    head.setMatrixAt(i, matrix)

    resolveFormationSlotPosition(i, clampedCount, layout, visualParams.armY, armLeftPosition)
    applyForestJitter(i, armLeftPosition)
    armLeftPosition.x -= visualParams.armXOffset
    armLeftPosition.z += visualParams.armZOffset
    matrix.compose(armLeftPosition, quaternion, scale)
    armLeft.setMatrixAt(i, matrix)

    resolveFormationSlotPosition(i, clampedCount, layout, visualParams.armY, armRightPosition)
    applyForestJitter(i, armRightPosition)
    armRightPosition.x += visualParams.armXOffset
    armRightPosition.z += visualParams.armZOffset
    matrix.compose(armRightPosition, quaternion, scale)
    armRight.setMatrixAt(i, matrix)

    resolveFormationSlotPosition(i, clampedCount, layout, visualParams.legY, legLeftPosition)
    applyForestJitter(i, legLeftPosition)
    legLeftPosition.x -= visualParams.legXOffset
    legLeftPosition.z += visualParams.legFrontZ
    matrix.compose(legLeftPosition, quaternion, scale)
    legLeft.setMatrixAt(i, matrix)

    resolveFormationSlotPosition(i, clampedCount, layout, visualParams.legY, legRightPosition)
    applyForestJitter(i, legRightPosition)
    legRightPosition.x += visualParams.legXOffset
    legRightPosition.z += visualParams.legBackZ
    matrix.compose(legRightPosition, quaternion, scale)
    legRight.setMatrixAt(i, matrix)
  }

  body.instanceMatrix.needsUpdate = true
  head.instanceMatrix.needsUpdate = true
  armLeft.instanceMatrix.needsUpdate = true
  armRight.instanceMatrix.needsUpdate = true
  legLeft.instanceMatrix.needsUpdate = true
  legRight.instanceMatrix.needsUpdate = true
  body.computeBoundingSphere()
  head.computeBoundingSphere()
  armLeft.computeBoundingSphere()
  armRight.computeBoundingSphere()
  legLeft.computeBoundingSphere()
  legRight.computeBoundingSphere()

  group.add(body)
  group.add(head)
  group.add(armLeft)
  group.add(armRight)
  group.add(legLeft)
  group.add(legRight)

  const markerGeometry = new THREE.ConeGeometry(objectSize * 0.38, objectSize * 0.86, 3)
  markerGeometry.rotateX(Math.PI)
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0xf6f7fb,
    emissive: 0xffffff,
    emissiveIntensity: 0.16,
    roughness: 0.5,
    metalness: 0.08,
  })
  const marker = new THREE.Mesh(markerGeometry, markerMaterial)
  marker.position.set(0, objectSize * 1.85, -layout.halfDepthSpan - layout.rowSpacing * 1.02)
  marker.castShadow = false

  const {
    flagRoot,
    flagCloth,
    flagMaterial,
    barsRoot,
    hpBarFill,
    ammoBarFill,
    ammoBarBackground,
    baseFlagY,
  } = createUnitUi(objectSize)
  const { retreatFlagsRoot, retreatFlagCloths, retreatFlagMaterial } = createRetreatFlags(
    clampedCount,
    objectSize,
    layout,
    baseFlagY,
    resolveFormationSlotPosition
  )

  group.add(marker)
  group.add(flagRoot)
  group.add(retreatFlagsRoot)
  return {
    group,
    visualSignature: getVisualSignature(formation),
    flagRoot,
    flagCloth,
    flagMaterial,
    retreatFlagsRoot,
    retreatFlagCloths,
    retreatFlagMaterial,
    barsRoot,
    hpBarFill,
    ammoBarFill,
    ammoBarBackground,
    baseFlagY,
    bodyMaterial,
    headMaterial,
    limbMaterial,
    markerMaterial,
    layout,
  }
}
