import * as THREE from 'three'
import { filterPointsNatural } from '../instancing'
import type { WorldRenderContext } from '../types'

function makeTreeTextures(renderer: THREE.WebGLRenderer) {
  const barkCanvas = document.createElement('canvas')
  barkCanvas.width = 128
  barkCanvas.height = 128
  const barkCtx = barkCanvas.getContext('2d')!
  barkCtx.fillStyle = '#6a4b33'
  barkCtx.fillRect(0, 0, barkCanvas.width, barkCanvas.height)
  for (let i = 0; i < 220; i += 1) {
    const x = (i * 29) % barkCanvas.width
    const w = 1 + (i % 3)
    barkCtx.fillStyle = i % 2 === 0 ? 'rgba(86,58,35,0.55)' : 'rgba(118,83,56,0.45)'
    barkCtx.fillRect(x, 0, w, barkCanvas.height)
  }

  const leafCanvas = document.createElement('canvas')
  leafCanvas.width = 128
  leafCanvas.height = 128
  const leafCtx = leafCanvas.getContext('2d')!
  const grad = leafCtx.createLinearGradient(0, 0, 0, 128)
  grad.addColorStop(0, '#4fae4e')
  grad.addColorStop(1, '#2b6f2d')
  leafCtx.fillStyle = grad
  leafCtx.fillRect(0, 0, leafCanvas.width, leafCanvas.height)
  for (let i = 0; i < 480; i += 1) {
    const x = (i * 37) % leafCanvas.width
    const y = (i * 53) % leafCanvas.height
    const r = 2 + ((i * 17) % 4)
    leafCtx.fillStyle = i % 3 === 0 ? 'rgba(135,188,104,0.38)' : 'rgba(34,89,39,0.32)'
    leafCtx.beginPath()
    leafCtx.arc(x, y, r, 0, Math.PI * 2)
    leafCtx.fill()
  }

  const barkMap = new THREE.CanvasTexture(barkCanvas)
  barkMap.wrapS = THREE.RepeatWrapping
  barkMap.wrapT = THREE.RepeatWrapping
  barkMap.repeat.set(1, 4)
  barkMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  barkMap.colorSpace = THREE.SRGBColorSpace
  barkMap.needsUpdate = true

  const leafMap = new THREE.CanvasTexture(leafCanvas)
  leafMap.wrapS = THREE.RepeatWrapping
  leafMap.wrapT = THREE.RepeatWrapping
  leafMap.repeat.set(2, 2)
  leafMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  leafMap.colorSpace = THREE.SRGBColorSpace
  leafMap.needsUpdate = true

  return { barkMap, leafMap }
}

export function addForestTrees(
  context: WorldRenderContext,
  points: Array<[number, number]>,
  config: Record<string, any>
) {
  const { scene, renderer, world, pixelToWorld, hash2D } = context
  if (!points.length) {
    return {
      instanceCount: 0,
      sourceCount: 0,
      density: Number(config.density ?? 1),
      treePoints: [] as Array<[number, number]>,
    }
  }

  const filtered = filterPointsNatural(points, config, world, hash2D)
  const acceptedPoints = filtered.acceptedPoints
  if (!acceptedPoints.length) {
    return {
      instanceCount: 0,
      sourceCount: points.length,
      density: filtered.density,
      treePoints: [] as Array<[number, number]>,
    }
  }

  const textures = makeTreeTextures(renderer)
  const unitTrunkGeometry = new THREE.CylinderGeometry(1, 1.08, 1, 12)
  const crownGeometries = [
    new THREE.ConeGeometry(1, 1, 14),
    new THREE.SphereGeometry(0.9, 14, 12),
    new THREE.IcosahedronGeometry(0.95, 1),
  ]
  const trunkMaterial = new THREE.MeshStandardMaterial({
    map: textures.barkMap,
    color: 0x9a7654,
    roughness: 0.96,
    metalness: 0,
  })
  const crownMaterials = [
    new THREE.MeshStandardMaterial({ map: textures.leafMap, color: 0x2f8e37, roughness: 0.92, metalness: 0 }),
    new THREE.MeshStandardMaterial({ map: textures.leafMap, color: 0x3f9942, roughness: 0.9, metalness: 0 }),
    new THREE.MeshStandardMaterial({ map: textures.leafMap, color: 0x468c39, roughness: 0.91, metalness: 0 }),
  ]

  const variantBins = [0, 0, 0]
  for (let i = 0; i < acceptedPoints.length; i += 1) {
    const rand = acceptedPoints[i]![2]
    const idx = rand < 0.34 ? 0 : rand < 0.67 ? 1 : 2
    variantBins[idx] = (variantBins[idx] ?? 0) + 1
  }

  const trunks = new THREE.InstancedMesh(unitTrunkGeometry, trunkMaterial, acceptedPoints.length)
  const crowns = crownGeometries.map((g, idx) => new THREE.InstancedMesh(g, crownMaterials[idx]!, variantBins[idx]!))
  const crownWriteOffsets = [0, 0, 0]

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const yAxis = new THREE.Vector3(0, 1, 0)
  const baseHeight = Math.max(world.objectSize * 2.6, Number(config.baseHeight ?? world.objectSize * 3.1))
  const baseRadius = Math.max(world.objectSize * 0.12, Number(config.baseRadius ?? world.objectSize * 0.15))
  const placementJitterMeters = Math.max(0, Number(config.placementJitterMeters ?? Math.max(world.objectSize * 0.7, 3.2)))
  const placementJitterPx = placementJitterMeters / Math.max(0.001, world.objectSize)

  for (let i = 0; i < acceptedPoints.length; i += 1) {
    const [px, py, rand] = acceptedPoints[i]!
    const yawLocal = hash2D(Math.floor(px), Math.floor(py), 211) * Math.PI * 2
    const variant = rand < 0.34 ? 0 : rand < 0.67 ? 1 : 2
    const trunkHeight = baseHeight * (0.86 + rand * 0.62)
    const trunkRadius = baseRadius * (0.82 + rand * 0.45)
    const crownHeight = trunkHeight * (variant === 0 ? 1.35 : variant === 1 ? 1.05 : 1.18)
    const crownRadius = trunkHeight * (variant === 0 ? 0.5 : variant === 1 ? 0.64 : 0.55)
    const jitterX = (hash2D(Math.floor(px * 13), Math.floor(py * 13), 271) - 0.5) * placementJitterPx
    const jitterY = (hash2D(Math.floor(px * 17), Math.floor(py * 17), 307) - 0.5) * placementJitterPx
    const jitteredWorldPos = pixelToWorld(px + jitterX, py + jitterY)

    quaternion.setFromAxisAngle(yAxis, yawLocal)
    position.set(jitteredWorldPos.x, trunkHeight * 0.5, jitteredWorldPos.z)
    scale.set(trunkRadius, trunkHeight, trunkRadius)
    matrix.compose(position, quaternion, scale)
    trunks.setMatrixAt(i, matrix)

    const crownMesh = crowns[variant]!
    const crownIndex = crownWriteOffsets[variant]!
    crownWriteOffsets[variant]! += 1
    position.set(jitteredWorldPos.x, trunkHeight + crownHeight * 0.46, jitteredWorldPos.z)
    scale.set(crownRadius, crownHeight, crownRadius)
    matrix.compose(position, quaternion, scale)
    crownMesh.setMatrixAt(crownIndex, matrix)
  }

  const allInstanced = [trunks, ...crowns]
  for (let i = 0; i < allInstanced.length; i += 1) {
    allInstanced[i]!.instanceMatrix.needsUpdate = true
    allInstanced[i]!.frustumCulled = false
    allInstanced[i]!.castShadow = true
    allInstanced[i]!.receiveShadow = true
    allInstanced[i]!.computeBoundingSphere()
    scene.add(allInstanced[i]!)
  }
  const treePoints = acceptedPoints.map(([px, py]) => [Math.round(px), Math.round(py)] as [number, number])
  return { instanceCount: acceptedPoints.length, sourceCount: points.length, density: filtered.density, treePoints }
}
