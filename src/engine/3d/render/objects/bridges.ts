import * as THREE from 'three'
import { componentExtentsAlongAngle, estimateComponentAngleRadians } from '../math'
import type { MaskComponent } from '../mask'
import type { WorldRenderContext } from '../types'

function buildPointKey(x: number, y: number) {
  return `${x},${y}`
}

export function buildBridgeWaterConnectors(
  bridgeComponents: MaskComponent[],
  _roadPoints: Array<[number, number]>,
  waterPoints: Array<[number, number]>
) {
  if (!bridgeComponents.length || !waterPoints.length) return []
  const waterSet = new Set<string>()
  for (let i = 0; i < waterPoints.length; i += 1) {
    waterSet.add(buildPointKey(Math.round(waterPoints[i]![0]), Math.round(waterPoints[i]![1])))
  }
  const result: Array<[number, number]> = []
  for (let i = 0; i < bridgeComponents.length; i += 1) {
    const c = bridgeComponents[i]!
    for (let p = 0; p < c.pixels.length; p += 1) {
      const [x, y] = c.pixels[p]!
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox
          const ny = y + oy
          if (waterSet.has(buildPointKey(nx, ny))) result.push([nx, ny])
        }
      }
    }
  }
  const unique = new Set<string>()
  const out: Array<[number, number]> = []
  for (let i = 0; i < result.length; i += 1) {
    const key = buildPointKey(result[i]![0], result[i]![1])
    if (unique.has(key)) continue
    unique.add(key)
    out.push(result[i]!)
  }
  return out
}

export function addBridges(
  context: WorldRenderContext,
  components: MaskComponent[],
  _roadPoints: Array<[number, number]>,
  config: Record<string, any>
) {
  const { scene, world, pixelToWorld } = context
  const valid = components.filter((c) => c.area >= 2)
  if (!valid.length) return { instanceCount: 0, sourceCount: components.length, update: () => {} }

  const sampledPixelSpan = Math.max(1, Number(world.sampledToSourceScale ?? 1))
  const deckMaterial = new THREE.MeshStandardMaterial(config.material)
  const unitGeometry = new THREE.BoxGeometry(1, 1, 1)
  const plans: Array<{
    centerX: number
    centerY: number
    bridgeAngle: number
    bridgeLength: number
    bridgeWidth: number
    deckThickness: number
    deckEdgeY: number
    deckRise: number
    deckBlocksCount: number
  }> = []
  let totalDeckBlocks = 0
  for (let i = 0; i < valid.length; i += 1) {
    const component = valid[i]!
    const angle = estimateComponentAngleRadians(component)
    const ext = componentExtentsAlongAngle(component, angle)
    const bridgeLength = Math.max(world.objectSize * 3, ext.lengthPx * world.objectSize * sampledPixelSpan * 1.2)
    const bridgeWidth = Math.max(
      world.objectSize * 1.28,
      Math.min(
        Number(config.maxWidthPx ?? 4.2) * world.objectSize * sampledPixelSpan,
        ext.widthPx * world.objectSize * sampledPixelSpan * Number(config.roadWidthToBridgeWidthScale ?? 1.9)
      )
    )
    const deckThickness = Math.max(world.objectSize * 0.26, Number(config.deckThickness ?? world.objectSize * 0.3))
    const deckEdgeY = Math.max(world.objectSize * 0.16, Number(config.deckEdgeHeight ?? world.objectSize * 0.2))
    const deckRise = Math.max(world.objectSize * 0.08, Number(config.deckRise ?? world.objectSize * 2.2))
    const deckBlocksCount = Math.max(5, Math.floor(bridgeLength / (world.objectSize * 1.9)))
    totalDeckBlocks += deckBlocksCount
    plans.push({
      centerX: component.centroidX,
      centerY: component.centroidY,
      bridgeAngle: angle,
      bridgeLength,
      bridgeWidth,
      deckThickness,
      deckEdgeY,
      deckRise,
      deckBlocksCount,
    })
  }

  const deckMesh = new THREE.InstancedMesh(unitGeometry, deckMaterial, totalDeckBlocks)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const yAxis = new THREE.Vector3(0, 1, 0)
  let deckIndex = 0

  for (let i = 0; i < plans.length; i += 1) {
    const plan = plans[i]!
    const worldPos = pixelToWorld(plan.centerX, plan.centerY)
    quaternion.setFromAxisAngle(yAxis, -plan.bridgeAngle)
    const deckSegmentLength = Math.max(
      world.objectSize * 0.7,
      plan.bridgeLength / Math.max(1, plan.deckBlocksCount * 0.9)
    )
    for (let s = 0; s < plan.deckBlocksCount; s += 1) {
      const t = plan.deckBlocksCount === 1 ? 0 : -0.5 + s / Math.max(1, plan.deckBlocksCount - 1)
      const along = t * plan.bridgeLength
      const sx = worldPos.x + Math.cos(plan.bridgeAngle) * along
      const sz = worldPos.z + Math.sin(plan.bridgeAngle) * along
      const archShape = 1 - Math.min(1, Math.abs(t) * 2) ** 2
      const sy = plan.deckEdgeY + plan.deckRise * archShape
      position.set(sx, sy, sz)
      scale.set(deckSegmentLength, plan.deckThickness, plan.bridgeWidth)
      matrix.compose(position, quaternion, scale)
      deckMesh.setMatrixAt(deckIndex, matrix)
      deckIndex += 1
    }
  }

  deckMesh.instanceMatrix.needsUpdate = true
  deckMesh.frustumCulled = false
  deckMesh.castShadow = true
  deckMesh.receiveShadow = true
  deckMesh.computeBoundingSphere()
  scene.add(deckMesh)
  return { instanceCount: plans.length, sourceCount: components.length, update: () => {} }
}
