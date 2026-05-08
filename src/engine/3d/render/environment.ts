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

export function makeGround(context: WorldRenderContext) {
  const { scene, renderer, world } = context
  const grassTexture = createGrassTexture()
  if (grassTexture) {
    grassTexture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy())
  }

  const maxWorldSideCells = Math.max(world.width, world.height)
  // Radial fog uses vertex depth; subdivide large planes so fog interpolation stays stable.
  const groundSegments = Math.max(24, Math.min(320, Math.round(maxWorldSideCells / 20)))
  const baseSegments = Math.max(12, Math.floor(groundSegments / 2))

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(
      world.width * world.cellSize,
      world.height * world.cellSize,
      groundSegments,
      groundSegments
    ),
    new THREE.MeshStandardMaterial({
      map: grassTexture ?? null,
      color: 0x6f9f52,
      roughness: 0.98,
      metalness: 0.0,
    })
  )
  plane.rotation.x = -Math.PI / 2
  plane.position.y = 0
  plane.receiveShadow = true
  scene.add(plane)

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(
      world.width * world.cellSize * 1.25,
      world.height * world.cellSize * 1.25,
      baseSegments,
      baseSegments
    ),
    new THREE.MeshStandardMaterial({ color: 0x97b88f, roughness: 1, metalness: 0 })
  )
  base.rotation.x = -Math.PI / 2
  base.position.y = -Math.max(world.cellSize * 2, 2)
  scene.add(base)
}

