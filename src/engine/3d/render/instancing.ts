import * as THREE from 'three'
import { type WorldRenderContext } from './types'

export function filterPointsNatural(
  points: Array<[number, number]>,
  config: Record<string, any>,
  world: WorldRenderContext['world'],
  hash2D: (x: number, y: number, seed?: number) => number
) {
  const density = Math.min(1, Math.max(0.03, Number(config.density ?? 1)))
  const clusterMeters = Math.max(2, Number(config.clusterMeters ?? 20))
  const clusterPx = Math.max(1, clusterMeters / Math.max(0.001, world.objectSize))
  const jitterMeters = Math.max(0, Number(config.jitterMeters ?? 0))
  const jitterPx = jitterMeters / Math.max(0.001, world.objectSize)
  const seed = Number(config.seed ?? 0)
  const naturalDistribution = config.naturalDistribution !== false

  if (!naturalDistribution) {
    const acceptedPoints: Array<[number, number, number]> = []
    for (let i = 0; i < points.length; i += 1) {
      const [px, py] = points[i]!
      const jx = (hash2D(px, py, 97 + seed) - 0.5) * jitterPx
      const jy = (hash2D(px, py, 131 + seed) - 0.5) * jitterPx
      acceptedPoints.push([px + jx, py + jy, hash2D(px, py, 181 + seed)])
    }
    return { acceptedPoints, density: 1, clusterMeters }
  }

  const acceptedPoints: Array<[number, number, number]> = []
  for (let i = 0; i < points.length; i += 1) {
    const [px, py] = points[i]!
    const cluster = hash2D(Math.floor(px / clusterPx), Math.floor(py / clusterPx), 17 + seed)
    const localDensity = Math.min(0.99, Math.max(0.02, density * (0.55 + cluster * 0.9)))
    if (hash2D(px, py, 53 + seed) > localDensity) continue
    const jx = (hash2D(px, py, 97 + seed) - 0.5) * jitterPx
    const jy = (hash2D(px, py, 131 + seed) - 0.5) * jitterPx
    acceptedPoints.push([px + jx, py + jy, hash2D(px, py, 181 + seed)])
  }

  return { acceptedPoints, density, clusterMeters }
}

export function addInstancedLayer(
  context: WorldRenderContext,
  points: Array<[number, number]>,
  config: Record<string, any>
) {
  const { scene, world, pixelToWorld, hash2D } = context
  if (!points.length) return { instanceCount: 0, sourceCount: 0, density: Number(config.density ?? 1) }

  const filtered = filterPointsNatural(points, config, world, hash2D)
  const acceptedPoints = filtered.acceptedPoints
  if (!acceptedPoints.length) {
    return { instanceCount: 0, sourceCount: points.length, density: filtered.density }
  }

  const geometry = config.geometryFactory()
  const materialConfig =
    typeof config.materialFactory === 'function' ? config.materialFactory({ ...context, THREE }) : config.material
  const material = new THREE.MeshStandardMaterial(materialConfig)
  const mesh = new THREE.InstancedMesh(geometry, material, acceptedPoints.length)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const yBase = Number(config.yBase ?? 0)

  for (let i = 0; i < acceptedPoints.length; i += 1) {
    const [px, py, rand] = acceptedPoints[i]!
    const worldPos = pixelToWorld(px, py)
    const sx = (config.scaleXMin ?? 1) + rand * ((config.scaleXMax ?? 1) - (config.scaleXMin ?? 1))
    const sy = (config.scaleYMin ?? 1) + rand * ((config.scaleYMax ?? 1) - (config.scaleYMin ?? 1))
    const sz = (config.scaleZMin ?? 1) + rand * ((config.scaleZMax ?? 1) - (config.scaleZMin ?? 1))
    position.set(worldPos.x, yBase, worldPos.z)
    scale.set(sx, sy, sz)
    matrix.compose(position, quaternion, scale)
    mesh.setMatrixAt(i, matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.frustumCulled = false
  mesh.castShadow = config.castShadow !== false
  mesh.receiveShadow = config.receiveShadow !== false
  mesh.computeBoundingSphere()
  scene.add(mesh)
  return {
    instanceCount: acceptedPoints.length,
    sourceCount: points.length,
    density: filtered.density,
    clusterMeters: filtered.clusterMeters,
  }
}

