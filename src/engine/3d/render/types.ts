import * as THREE from 'three'

export type WorldRenderInfo = {
  width: number
  height: number
  cellSize: number
  objectSize: number
  sampledToSourceScale: number
}

export type WorldRenderContext = {
  scene: THREE.Object3D
  renderer: THREE.WebGLRenderer
  world: WorldRenderInfo
  pixelToWorld: (px: number, py: number) => { x: number; z: number }
  hash2D: (x: number, y: number, seed?: number) => number
}

