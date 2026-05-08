import * as THREE from 'three'
import { componentExtentsAlongAngle, estimateComponentAngleRadians } from '../math'
import type { MaskComponent } from '../mask'
import type { WorldRenderContext } from '../types'

export type BuildingAnchor = {
  id: string
  x: number
  z: number
  footprintX: number
  footprintZ: number
  bodyHeight: number
  isVirtual?: boolean
}

function makeFacadeTexture(
  style: 'brick' | 'plaster',
  baseColor: string,
  floors = 2,
  brickAccentColor = 'rgba(95,38,30,0.33)'
) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (style === 'brick') {
    const brickW = 24
    const brickH = 11
    for (let y = 0; y < canvas.height; y += brickH) {
      const offset = (Math.floor(y / brickH) % 2) * (brickW / 2)
      for (let x = -brickW; x < canvas.width + brickW; x += brickW) {
        ctx.fillStyle = brickAccentColor
        ctx.fillRect(Math.floor(x + offset), y, brickW - 1, brickH - 2)
      }
    }
  }
  const windowFloors = Math.max(1, Math.min(4, Math.round(floors)))
  const floorBand = canvas.height / windowFloors
  for (let floor = 0; floor < windowFloors; floor += 1) {
    const top = Math.floor(floor * floorBand + floorBand * 0.24)
    const winH = Math.floor(floorBand * 0.4)
    const columns = style === 'brick' ? 3 : 2
    for (let col = 0; col < columns; col += 1) {
      const padX = canvas.width / (columns + 1)
      const x = Math.floor((col + 1) * padX - canvas.width * 0.07)
      const w = Math.floor(canvas.width * 0.14)
      const lit = (floor + col) % 5 === 0
      ctx.fillStyle = lit ? 'rgba(241,215,150,0.45)' : 'rgba(37,50,66,0.58)'
      ctx.fillRect(x, top, w, winH)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function makeRoofTexture(baseColor: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let y = 0; y < canvas.height; y += 8) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.fillRect(0, y, canvas.width, 2)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function makeWoodRoofTexture(baseColor: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let x = 0; x < canvas.width; x += 10) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(x, 0, 2, canvas.height)
  }
  for (let y = 0; y < canvas.height; y += 24) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(0, y, canvas.width, 1)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

export function addBuildingsFromComponents(
  context: WorldRenderContext,
  components: MaskComponent[],
  _roadPoints: Array<[number, number]>,
  config: Record<string, any>
) {
  const { scene, world, pixelToWorld, hash2D } = context
  const valid = components.filter((c) => c.area >= 2)
  if (!valid.length) return { instanceCount: 0, sourceCount: components.length, anchors: [] as BuildingAnchor[] }

  const floors = Math.max(1, Math.round(Number(config.floors ?? 2)))
  const floorHeight = Math.max(world.objectSize * 1.05, Number(config.floorHeight ?? world.objectSize * 1.35))
  const roofHeight = Math.max(world.objectSize * 0.35, Number(config.roofHeight ?? world.objectSize * 0.55))
  const facadeStyle = config.facadeStyle === 'brick' ? 'brick' : 'plaster'
  const facadeBaseColor =
    typeof config.facadeBaseColor === 'string'
      ? config.facadeBaseColor
      : facadeStyle === 'brick'
        ? '#9e4f42'
        : '#c8c1b0'
  const brickAccentColor =
    typeof config.brickAccentColor === 'string' ? config.brickAccentColor : 'rgba(95,38,30,0.33)'
  const wallMap = makeFacadeTexture(
    facadeStyle,
    facadeBaseColor,
    floors,
    brickAccentColor
  )
  const roofTextureStyle = config.roofTextureStyle === 'wood' ? 'wood' : 'tiles'
  const roofBaseColor =
    typeof config.roofBaseColor === 'string'
      ? config.roofBaseColor
      : facadeStyle === 'brick'
        ? '#6f4438'
        : '#5e6268'
  const roofMap =
    roofTextureStyle === 'wood' ? makeWoodRoofTexture(roofBaseColor) : makeRoofTexture(roofBaseColor)

  const bodyMaterial = new THREE.MeshStandardMaterial({
    map: wallMap,
    color: config.material?.color ?? 0xb8b0a2,
    roughness: Number(config.material?.roughness ?? 0.85),
    metalness: Number(config.material?.metalness ?? 0.02),
  })
  const roofMaterial = new THREE.MeshStandardMaterial({
    map: roofMap,
    color: config.roofColor ?? (facadeStyle === 'brick' ? 0x6f4438 : 0x5b6066),
    roughness: 0.92,
    metalness: 0,
  })

  const unitGeometry = new THREE.BoxGeometry(1, 1, 1)
  const bodyMesh = new THREE.InstancedMesh(unitGeometry, bodyMaterial, valid.length)
  const roofMesh = new THREE.InstancedMesh(unitGeometry, roofMaterial, valid.length)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const yAxis = new THREE.Vector3(0, 1, 0)
  const anchors: BuildingAnchor[] = []

  for (let i = 0; i < valid.length; i += 1) {
    const component = valid[i]!
    const angle = estimateComponentAngleRadians(component)
    const ext = componentExtentsAlongAngle(component, angle)
    const worldPos = pixelToWorld(component.centroidX, component.centroidY)
    const sampledPixelSpan = Math.max(1, Number(world.sampledToSourceScale ?? 1))
    const footprintX = Math.max(
      world.objectSize * 1.2,
      Math.min(
        Number(config.maxFootprintMeters ?? world.objectSize * 8),
        ext.lengthPx * world.objectSize * sampledPixelSpan * Number(config.footprintScaleX ?? 1.15)
      )
    )
    const footprintZ = Math.max(
      world.objectSize * 1.2,
      Math.min(
        Number(config.maxFootprintMeters ?? world.objectSize * 8),
        ext.widthPx * world.objectSize * sampledPixelSpan * Number(config.footprintScaleZ ?? 1.15)
      )
    )
    const randH = hash2D(Math.floor(component.centroidX), Math.floor(component.centroidY), 421)
    const randRoof = hash2D(Math.floor(component.centroidX), Math.floor(component.centroidY), 503)
    const bodyHeight = floors * floorHeight * (0.92 + randH * 0.2)
    const roofH = roofHeight * (0.85 + randRoof * 0.5)
    const roofScale = Number(config.roofScale ?? 1.08)

    position.set(worldPos.x, bodyHeight * 0.5, worldPos.z)
    quaternion.setFromAxisAngle(yAxis, -angle)
    scale.set(footprintX, bodyHeight, footprintZ)
    matrix.compose(position, quaternion, scale)
    bodyMesh.setMatrixAt(i, matrix)

    position.set(worldPos.x, bodyHeight + roofH * 0.5, worldPos.z)
    scale.set(footprintX * roofScale, roofH, footprintZ * roofScale)
    matrix.compose(position, quaternion, scale)
    roofMesh.setMatrixAt(i, matrix)

    anchors.push({
      id: `${Math.round(component.centroidX)}:${Math.round(component.centroidY)}:${i}`,
      x: worldPos.x,
      z: worldPos.z,
      footprintX,
      footprintZ,
      bodyHeight,
    })
  }

  for (const mesh of [bodyMesh, roofMesh]) {
    mesh.instanceMatrix.needsUpdate = true
    mesh.frustumCulled = false
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.computeBoundingSphere()
    scene.add(mesh)
  }
  return { instanceCount: valid.length, sourceCount: components.length, anchors }
}
