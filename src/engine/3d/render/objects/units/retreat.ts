import * as THREE from 'three'
import type { FormationLayout } from './formations'
import { WHITE_FLAG_TEXTURE } from './ui'

export type RetreatVisual = {
  retreatFlagsRoot: THREE.Group
  retreatFlagCloths: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[]
  retreatFlagMaterial: THREE.MeshBasicMaterial
}

export function createRetreatFlags(
  clampedCount: number,
  objectSize: number,
  layout: FormationLayout,
  flagBaseY: number,
  resolveFormationSlotPosition: (
    index: number,
    count: number,
    layout: FormationLayout,
    y: number,
    target: THREE.Vector3
  ) => void
): RetreatVisual {
  const retreatFlagCount = Math.max(1, Math.floor(clampedCount / 10))
  const retreatFlagsRoot = new THREE.Group()
  const retreatFlagMaterial = new THREE.MeshBasicMaterial({
    map: WHITE_FLAG_TEXTURE,
    transparent: true,
    alphaTest: 0.12,
    color: 0xffffff,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  })
  const retreatFlagCloths: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = []
  const retreatFlagW = objectSize * 1.3
  const retreatFlagH = objectSize * 0.9
  const retreatSlot = new THREE.Vector3()
  for (let i = 0; i < retreatFlagCount; i += 1) {
    const row = Math.floor((i * layout.rows) / retreatFlagCount)
    const colSeed = (i * 1.61803398875) % 1
    const col = Math.floor(colSeed * layout.columns)
    const unitsBeforeRow = row * layout.columns
    const unitsLeft = clampedCount - unitsBeforeRow
    const unitsInRow = Math.max(1, Math.min(layout.columns, unitsLeft))
    const effectiveCol = Math.min(col, unitsInRow - 1)
    const slotIndex = Math.min(clampedCount - 1, Math.max(0, unitsBeforeRow + effectiveCol))
    resolveFormationSlotPosition(slotIndex, clampedCount, layout, 0, retreatSlot)
    const x = retreatSlot.x + ((i % 2) - 0.5) * layout.columnSpacing * 0.22
    const z = retreatSlot.z + (((i + 1) % 3) - 1) * layout.rowSpacing * 0.2
    const poleH = flagBaseY + retreatFlagH * 1.4
    const whitePole = new THREE.Mesh(
      new THREE.CylinderGeometry(objectSize * 0.05, objectSize * 0.05, poleH, 7),
      new THREE.MeshStandardMaterial({ color: 0xd8d8db, roughness: 0.88, metalness: 0.03 })
    )
    whitePole.position.set(x - retreatFlagW * 0.45, poleH * 0.5, z)
    const whiteCloth = new THREE.Mesh(
      new THREE.PlaneGeometry(retreatFlagW, retreatFlagH, 1, 1),
      retreatFlagMaterial
    )
    whiteCloth.position.set(x, flagBaseY + retreatFlagH * 0.18, z)
    whiteCloth.renderOrder = 80
    whiteCloth.castShadow = false
    retreatFlagsRoot.add(whitePole)
    retreatFlagsRoot.add(whiteCloth)
    retreatFlagCloths.push(whiteCloth)
  }
  retreatFlagsRoot.visible = false
  return {
    retreatFlagsRoot,
    retreatFlagCloths,
    retreatFlagMaterial,
  }
}
