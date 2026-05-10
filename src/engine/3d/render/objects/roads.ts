import * as THREE from 'three'
import { addInstancedLayer } from '../instancing'
import { postProcessRoadPoints } from '../postprocess'
import type { WorldRenderContext } from '../types'

const ROAD_TEXTURE_CACHE = new WeakMap<typeof THREE, Record<string, THREE.Texture | null>>()

function createCanvasTexture(size: number, drawFn: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  drawFn(ctx, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function createEdgeBlendTexture(softness = 0.24, power = 1.35) {
  return createCanvasTexture(128, (ctx, size) => {
    const image = ctx.createImageData(size, size)
    const data = image.data
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = x / (size - 1)
        const v = y / (size - 1)
        const edge = Math.min(u, 1 - u, v, 1 - v)
        const t = Math.max(0, Math.min(1, edge / softness))
        const alpha = Math.pow(t, power)
        const idx = (y * size + x) * 4
        const value = Math.round(alpha * 255)
        data[idx] = value
        data[idx + 1] = value
        data[idx + 2] = value
        data[idx + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
  })
}

function createStoneTexture() {
  return createCanvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#6f6f72'
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 6500; i += 1) {
      const x = Math.random() * size
      const y = Math.random() * size
      const shade = 45 + Math.floor(Math.random() * 95)
      const alpha = 0.06 + Math.random() * 0.2
      ctx.fillStyle = `rgba(${shade},${shade},${shade + 6},${alpha.toFixed(3)})`
      ctx.fillRect(x, y, 1 + Math.random() * 1.4, 1 + Math.random() * 1.4)
    }
  })
}

function createDirtTexture() {
  return createCanvasTexture(256, (ctx, size) => {
    const grd = ctx.createLinearGradient(0, 0, size, size)
    grd.addColorStop(0, '#8a7759')
    grd.addColorStop(0.5, '#7b694d')
    grd.addColorStop(1, '#6f5c45')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 9000; i += 1) {
      const x = Math.random() * size
      const y = Math.random() * size
      const r = 70 + Math.floor(Math.random() * 55)
      const g = 55 + Math.floor(Math.random() * 45)
      const b = 35 + Math.floor(Math.random() * 40)
      const alpha = 0.07 + Math.random() * 0.22
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`
      ctx.fillRect(x, y, 1 + Math.random() * 2.1, 1 + Math.random() * 2.1)
    }
  })
}

function getRoadTextures() {
  const cached = ROAD_TEXTURE_CACHE.get(THREE)
  if (cached) return cached
  const textures = {
    edgeBlendSoft: createEdgeBlendTexture(0.34, 1.65),
    edgeBlendMedium: createEdgeBlendTexture(0.26, 1.45),
    stone: createStoneTexture(),
    dirt: createDirtTexture(),
  }
  ROAD_TEXTURE_CACHE.set(THREE, textures)
  return textures
}

export function createRoadMaterialFactory(kind: 'stone' | 'dirt') {
  return ({ renderer }: { renderer: THREE.WebGLRenderer }) => {
    const textures = getRoadTextures()
    const map = kind === 'stone' ? textures.stone : textures.dirt
    const anisotropy = Math.min(12, renderer.capabilities.getMaxAnisotropy())
    if (map) {
      map.repeat.set(kind === 'stone' ? 0.95 : 1.05, kind === 'stone' ? 0.95 : 1.05)
      map.anisotropy = anisotropy
    }
    return {
      map: map ?? null,
      transparent: false,
      depthWrite: true,
      roughness: kind === 'stone' ? 0.85 : 0.93,
      metalness: 0.02,
      color: kind === 'stone' ? 0xb8b3aa : 0xb69d7c,
    }
  }
}

export function createRoadTransitionMaterialFactory(kind: 'stone' | 'dirt') {
  return ({ renderer }: { renderer: THREE.WebGLRenderer }) => {
    const textures = getRoadTextures()
    const map = kind === 'stone' ? textures.stone : textures.dirt
    const anisotropy = Math.min(12, renderer.capabilities.getMaxAnisotropy())
    if (map) {
      map.repeat.set(1, 1)
      map.anisotropy = anisotropy
    }
    const edgeBlend = kind === 'stone' ? textures.edgeBlendMedium : textures.edgeBlendSoft
    if (edgeBlend) {
      edgeBlend.repeat.set(1, 1)
      edgeBlend.anisotropy = anisotropy
    }
    return {
      map: map ?? null,
      alphaMap: edgeBlend ?? null,
      transparent: true,
      depthWrite: false,
      roughness: kind === 'stone' ? 0.89 : 0.96,
      metalness: 0,
      opacity: kind === 'stone' ? 0.34 : 0.3,
      color: kind === 'stone' ? 0xa8a39a : 0xa98f72,
    }
  }
}

function buildPointKey(x: number, y: number) {
  return `${x},${y}`
}

function parsePointKey(key: string): [number, number] {
  const [x, y] = key.split(',')
  return [Number(x), Number(y)]
}

function buildPointSet(points: Array<[number, number]>) {
  const set = new Set<string>()
  for (let i = 0; i < points.length; i += 1) set.add(buildPointKey(Math.round(points[i]![0]), Math.round(points[i]![1])))
  return set
}

export function buildRoadTransitionPoints(
  roadPoints: Array<[number, number]>,
  occupiedPoints: Array<[number, number]>,
  blockedPoints: Array<[number, number]> = [],
  radius = 1
) {
  if (!roadPoints.length) return []
  const occupied = buildPointSet(occupiedPoints)
  const blocked = buildPointSet(blockedPoints)
  const transitionSet = new Set<string>()
  const offsets: Array<[number, number]> = []
  const clampedRadius = Math.max(1, Math.min(3, Math.round(radius)))
  for (let oy = -clampedRadius; oy <= clampedRadius; oy += 1) {
    for (let ox = -clampedRadius; ox <= clampedRadius; ox += 1) {
      if (!ox && !oy) continue
      offsets.push([ox, oy])
    }
  }
  for (let i = 0; i < roadPoints.length; i += 1) {
    const x = Math.round(roadPoints[i]![0])
    const y = Math.round(roadPoints[i]![1])
    for (let j = 0; j < offsets.length; j += 1) {
      const nx = x + offsets[j]![0]
      const ny = y + offsets[j]![1]
      const key = buildPointKey(nx, ny)
      if (occupied.has(key) || blocked.has(key)) continue
      transitionSet.add(key)
    }
  }
  const transitions: Array<[number, number]> = []
  transitionSet.forEach((key) => transitions.push(parsePointKey(key)))
  return transitions
}

export function buildRoadDatasets(
  raw: {
    road: { points: Array<[number, number]>; step: number }
    goodRoad: { points: Array<[number, number]>; step: number }
    roadForBridge: { points: Array<[number, number]>; step: number }
    goodRoadForBridge: { points: Array<[number, number]>; step: number }
  },
  postConfig: Record<string, any>
) {
  return {
    road: { ...raw.road, points: postProcessRoadPoints(raw.road.points, postConfig) },
    goodRoad: { ...raw.goodRoad, points: postProcessRoadPoints(raw.goodRoad.points, postConfig) },
    roadForBridge: { ...raw.roadForBridge, points: postProcessRoadPoints(raw.roadForBridge.points, postConfig) },
    goodRoadForBridge: {
      ...raw.goodRoadForBridge,
      points: postProcessRoadPoints(raw.goodRoadForBridge.points, postConfig),
    },
  }
}

export function renderRoadLayer(
  context: WorldRenderContext,
  points: Array<[number, number]>,
  config: Record<string, any>
) {
  return addInstancedLayer(context, points, config)
}
