import * as THREE from 'three'
import type { WorldRenderContext } from './types'

function createGrassTexture() {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const baseGradient = ctx.createLinearGradient(0, 0, size, size)
  baseGradient.addColorStop(0, '#5e8f42')
  baseGradient.addColorStop(0.45, '#6ea54d')
  baseGradient.addColorStop(1, '#4f7e3b')
  ctx.fillStyle = baseGradient
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 24000; i += 1) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 85 + Math.floor(Math.random() * 45)
    const g = 95 + Math.floor(Math.random() * 70)
    const b = 60 + Math.floor(Math.random() * 40)
    const alpha = 0.05 + Math.random() * 0.2
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`
    ctx.fillRect(x, y, 1 + Math.random() * 2.4, 1 + Math.random() * 2.4)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

export type GroundBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

// Зоны могут перекрываться, а копланарные плоскости дают z-fighting. Разносим
// их по высоте на величину, которую не видно, но которой хватает глубине.
const OVERLAP_Y_STEP = 0.01

function unionBounds(zones: GroundBounds[]): GroundBounds {
  return {
    minX: Math.min(...zones.map((zone) => zone.minX)),
    maxX: Math.max(...zones.map((zone) => zone.maxX)),
    minZ: Math.min(...zones.map((zone) => zone.minZ)),
    maxZ: Math.max(...zones.map((zone) => zone.maxZ)),
  }
}

/**
 * Земля строится по кускам: без активных зон это одна плоскость на всю карту,
 * с зонами — по плоскости на зону, чтобы между ними ничего не просвечивало.
 */
export function makeGround(context: WorldRenderContext, zones: GroundBounds[]) {
  const { scene, renderer, world } = context
  if (!zones.length) return

  const grassTexture = createGrassTexture()
  if (grassTexture) {
    grassTexture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy())
  }
  const groundMaterial = new THREE.MeshStandardMaterial({
    map: grassTexture ?? null,
    color: 0x6f9f52,
    roughness: 0.98,
    metalness: 0.0,
  })

  const bounds = unionBounds(zones)
  const unionWidthMeters = bounds.maxX - bounds.minX
  const unionHeightMeters = bounds.maxZ - bounds.minZ
  const maxWorldSideCells = Math.max(unionWidthMeters, unionHeightMeters) / world.cellSize
  // Radial fog uses vertex depth; subdivide large planes so fog interpolation stays stable.
  const groundSegments = Math.max(24, Math.min(320, Math.round(maxWorldSideCells / 20)))
  const baseSegments = Math.max(12, Math.floor(groundSegments / 2))

  for (let i = 0; i < zones.length; i += 1) {
    const zone = zones[i]!
    const widthMeters = zone.maxX - zone.minX
    const heightMeters = zone.maxZ - zone.minZ
    if (!(widthMeters > 0) || !(heightMeters > 0)) continue

    const zoneSegments = Math.max(
      8,
      Math.round((groundSegments * Math.max(widthMeters, heightMeters)) / Math.max(unionWidthMeters, unionHeightMeters))
    )
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(widthMeters, heightMeters, zoneSegments, zoneSegments),
      groundMaterial
    )
    plane.rotation.x = -Math.PI / 2
    plane.position.set(
      (zone.minX + zone.maxX) / 2,
      i * OVERLAP_Y_STEP,
      (zone.minZ + zone.maxZ) / 2
    )
    plane.receiveShadow = true
    scene.add(plane)
  }

  // Keep the base layer far beyond fog so its edge never shows through haze.
  const baseWidthMeters = Math.max(unionWidthMeters * 1.25, unionWidthMeters + 40000)
  const baseHeightMeters = Math.max(unionHeightMeters * 1.25, unionHeightMeters + 40000)
  const baseFogSegments = Math.max(
    baseSegments,
    Math.min(160, Math.round(Math.max(baseWidthMeters, baseHeightMeters) / 520))
  )

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(
      baseWidthMeters,
      baseHeightMeters,
      baseFogSegments,
      baseFogSegments
    ),
    new THREE.MeshStandardMaterial({ color: 0x97b88f, roughness: 1, metalness: 0 })
  )
  base.rotation.x = -Math.PI / 2
  base.position.set(
    (bounds.minX + bounds.maxX) / 2,
    -Math.max(world.cellSize * 2, 2),
    (bounds.minZ + bounds.maxZ) / 2
  )
  scene.add(base)
}

