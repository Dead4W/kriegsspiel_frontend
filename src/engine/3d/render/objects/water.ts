import * as THREE from 'three'
import type { WorldRenderContext } from '../types'

function buildRiverGrid(points: Array<[number, number]>, width: number, height: number) {
  const grid = new Uint8Array(width * height)
  const inBounds = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height
  for (let i = 0; i < points.length; i += 1) {
    const x = Math.round(points[i]![0])
    const y = Math.round(points[i]![1])
    if (!inBounds(x, y)) continue
    grid[y * width + x] = 1
  }
  return grid
}

function computeShoreDistanceMap(grid: Uint8Array, width: number, height: number, maxDistancePx: number) {
  const maxDist = Math.max(1, Number(maxDistancePx ?? 10))
  const total = width * height
  const distance = new Int16Array(total)
  for (let i = 0; i < total; i += 1) distance[i] = -1
  const queue = new Int32Array(total * 2)
  let qHead = 0
  let qTail = 0
  const push = (x: number, y: number) => {
    queue[qTail] = x
    queue[qTail + 1] = y
    qTail += 2
  }
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  const inBounds = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x
      if (grid[idx] === 0) continue
      let isShore = false
      for (let i = 0; i < neighbors.length; i += 1) {
        const nx = x + neighbors[i]![0]!
        const ny = y + neighbors[i]![1]!
        if (!inBounds(nx, ny) || grid[ny * width + nx] === 0) {
          isShore = true
          break
        }
      }
      if (isShore) {
        distance[idx] = 0
        push(x, y)
      }
    }
  }

  while (qHead < qTail) {
    const x = queue[qHead]!
    const y = queue[qHead + 1]!
    qHead += 2
    const idx = y * width + x
    const d = distance[idx]!
    if (d >= maxDist) continue
    for (let i = 0; i < neighbors.length; i += 1) {
      const nx = x + neighbors[i]![0]!
      const ny = y + neighbors[i]![1]!
      if (!inBounds(nx, ny)) continue
      const nIdx = ny * width + nx
      if (grid[nIdx] === 0 || distance[nIdx] !== -1) continue
      distance[nIdx] = d + 1
      push(nx, ny)
    }
  }
  for (let i = 0; i < total; i += 1) {
    if (grid[i]! === 1 && distance[i]! < 0) distance[i] = maxDist
  }
  return { distance, maxDist }
}

function smoothstep(min: number, max: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - min) / Math.max(1e-6, max - min)))
  return t * t * (3 - 2 * t)
}

function buildWaterDataTexture(
  points: Array<[number, number]>,
  width: number,
  height: number,
  maxDistancePx: number,
  depthPower: number
) {
  const grid = buildRiverGrid(points, width, height)
  const { distance, maxDist } = computeShoreDistanceMap(grid, width, height, maxDistancePx)
  const smallWaterRadiusPx = 6
  const kernelSize = smallWaterRadiusPx * 2 + 1
  const kernelArea = kernelSize * kernelSize
  const textureData = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x
      const t = idx * 4
      const isWater = grid[idx] === 1
      let depthNorm = 0
      if (isWater) {
        const d = Math.max(0, distance[idx]!)
        depthNorm = Math.pow(Math.min(1, d / Math.max(1, maxDist)), depthPower)
      }
      let localDensity = 0
      if (isWater) {
        let neighbors = 0
        for (let ky = -smallWaterRadiusPx; ky <= smallWaterRadiusPx; ky += 1) {
          const sy = y + ky
          if (sy < 0 || sy >= height) continue
          for (let kx = -smallWaterRadiusPx; kx <= smallWaterRadiusPx; kx += 1) {
            const sx = x + kx
            if (sx < 0 || sx >= width) continue
            neighbors += grid[sy * width + sx]!
          }
        }
        localDensity = neighbors / kernelArea
      }
      const smallWaterMask = isWater ? 1 - smoothstep(0.22, 0.55, localDensity) : 0
      textureData[t] = isWater ? 255 : 0
      textureData[t + 1] = Math.round(depthNorm * 255)
      textureData[t + 2] = Math.round(smallWaterMask * 255)
      textureData[t + 3] = 255
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(new ImageData(new Uint8ClampedArray(textureData), width, height), 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.flipY = false
  tex.needsUpdate = true
  return tex
}

const waterVertexShader = `
uniform float uTime;
uniform float uWaveSpeed;
uniform float uWaveAmplitude;
uniform float uWaveScale;
uniform vec3 uCameraPos;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vWaveNormal;
varying float vWave;
#include <common>
#include <logdepthbuf_pars_vertex>
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec3 transformed = position;
  vec3 localPos = position;
  float waveA = sin(localPos.x * uWaveScale + uTime * uWaveSpeed);
  float waveB = cos(localPos.y * (uWaveScale * 1.3) - uTime * (uWaveSpeed * 0.87));
  float waveC = sin((localPos.x + localPos.y) * (uWaveScale * 0.62) + uTime * (uWaveSpeed * 0.41));
  float wave = waveA * 0.5 + waveB * 0.35 + waveC * 0.25;
  transformed.z += wave * uWaveAmplitude;
  float slopeX = cos(localPos.x * uWaveScale + uTime * uWaveSpeed) * uWaveScale * uWaveAmplitude;
  float slopeY = -sin(localPos.y * (uWaveScale * 1.3) - uTime * (uWaveSpeed * 0.87)) * (uWaveScale * 1.3) * uWaveAmplitude;
  vec3 nLocal = normalize(vec3(-slopeX, -slopeY, 1.0));
  vWaveNormal = normalize(mat3(modelMatrix) * nLocal);
  vWave = wave;
  vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
  vWorldPos = worldPos.xyz;
  vFogDepth = length(worldPos.xz - uCameraPos.xz);
  vec4 mvPosition = viewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
`

const waterFragmentShader = `
uniform sampler2D uWaterMap;
uniform vec2 uTexelSize;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uSkyColor;
uniform vec3 uCameraPos;
uniform float uOpacityShallow;
uniform float uOpacityDeep;
uniform float uCoastSoftness;
uniform float uDaylight;
uniform float uMoonlight;
uniform float uTime;
uniform float uFlowSpeed;
uniform float uFlowScale;
uniform float uFlowStrength;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vWaveNormal;
varying float vWave;
#include <logdepthbuf_pars_fragment>
#include <fog_pars_fragment>
vec3 sampleMaskDepth(vec2 uv) {
  vec4 s = texture2D(uWaterMap, uv);
  return vec3(s.r, s.g, s.b);
}
void main() {
  #include <logdepthbuf_fragment>
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec3 mdC = sampleMaskDepth(uv);
  vec3 mdX1 = sampleMaskDepth(uv + vec2(uTexelSize.x, 0.0));
  vec3 mdX2 = sampleMaskDepth(uv - vec2(uTexelSize.x, 0.0));
  vec3 mdY1 = sampleMaskDepth(uv + vec2(0.0, uTexelSize.y));
  vec3 mdY2 = sampleMaskDepth(uv - vec2(0.0, uTexelSize.y));
  float mask = (mdC.x * 0.42) + ((mdX1.x + mdX2.x + mdY1.x + mdY2.x) * 0.145);
  if (mask < 0.02) discard;
  float depthRaw = (mdC.y * 0.5) + ((mdX1.y + mdX2.y + mdY1.y + mdY2.y) * 0.125);
  float edge = smoothstep(0.02, max(0.08, uCoastSoftness), mask);
  float depthMix = smoothstep(0.0, 1.0, depthRaw);
  vec3 normal = normalize(vWaveNormal);
  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  float ndotv = max(dot(normal, viewDir), 0.0);
  float fresnel = pow(1.0 - ndotv, 3.0);
  float lightLevel = clamp(uDaylight * 0.95 + uMoonlight * 0.24, 0.03, 1.0);
  float skyReflectMix = (0.08 + fresnel * 0.62) * (0.24 + uDaylight * 0.74 + uMoonlight * 0.18);
  vec3 waterBody = mix(uShallowColor, uDeepColor, depthMix);
  vec3 baseBody = waterBody * (0.4 + lightLevel * 0.6);
  vec3 reflected = mix(baseBody, uSkyColor, clamp(skyReflectMix, 0.0, 1.0));
  float sparkle = (sin(vWave * 5.2) * 0.5 + 0.5) * (0.006 + uDaylight * 0.05 + uMoonlight * 0.01);
  vec3 color = reflected + vec3(sparkle) + vec3(0.01, 0.018, 0.03) * uMoonlight;
  color *= 0.62 + lightLevel * 0.46;
  float smallWater = (mdC.z * 0.5) + ((mdX1.z + mdX2.z + mdY1.z + mdY2.z) * 0.125);
  float riverFactor = clamp(smallWater * smoothstep(0.2, 0.85, edge), 0.0, 1.0);
  vec2 flowUv = vec2(vUv.x * (3.0 * uFlowScale), vUv.y * (24.0 * uFlowScale));
  flowUv.y -= uTime * uFlowSpeed;
  float bandA = sin(flowUv.y + sin(flowUv.x * 2.0) * 0.5);
  float bandB = sin(flowUv.y * 2.4 + flowUv.x * 1.3 - uTime * (uFlowSpeed * 0.22));
  float flowBands = clamp((bandA * 0.68 + bandB * 0.32) * 0.5 + 0.5, 0.0, 1.0);
  float flowContrast = (flowBands - 0.5) * 2.0;
  float flowSharp = sign(flowContrast) * pow(abs(flowContrast), 0.55);
  float flowAmount = riverFactor * uFlowStrength;
  vec3 flowBrightTint = mix(uShallowColor, vec3(0.88, 0.95, 1.0), 0.18);
  vec3 flowDarkTint = uDeepColor * 0.72;
  color += flowBrightTint * max(flowSharp, 0.0) * (0.11 + 0.05 * uDaylight) * flowAmount;
  color -= flowDarkTint * max(-flowSharp, 0.0) * (0.09 + 0.04 * uDaylight) * flowAmount;
  color = clamp(color, 0.0, 1.0);
  float alpha = mix(uOpacityShallow, uOpacityDeep, depthMix) * edge;
  alpha = min(0.95, alpha + fresnel * 0.1 * edge);
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(color, alpha);
  #include <fog_fragment>
}
`

export function addWaterLayer(
  context: WorldRenderContext,
  points: Array<[number, number]>,
  options: Record<string, any> = {}
) {
  const { scene, world } = context
  const sourceCount = points.length
  if (!points.length) return { instanceCount: 0, sourceCount: 0, update: () => {} }
  const pointScale = Math.max(1, Number(options.pointScale ?? world.sampledToSourceScale ?? 1))
  const scaledPoints = (() => {
    if (pointScale === 1) return points
    const expanded: Array<[number, number]> = []
    const seen = new Set<string>()
    for (let i = 0; i < points.length; i += 1) {
      const sx = Math.floor(Number(points[i]![0]))
      const sy = Math.floor(Number(points[i]![1]))
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue
      const startX = Math.round(sx * pointScale)
      const startY = Math.round(sy * pointScale)
      for (let oy = 0; oy < pointScale; oy += 1) {
        for (let ox = 0; ox < pointScale; ox += 1) {
          const x = startX + ox
          const y = startY + oy
          const key = `${x},${y}`
          if (seen.has(key)) continue
          seen.add(key)
          expanded.push([x, y])
        }
      }
    }
    return expanded
  })()
  const maxDepthDistancePx = Number(options.maxDepthDistancePx ?? 12)
  const depthPower = Number(options.depthPower ?? 1.18)
  const waterMap = buildWaterDataTexture(
    scaledPoints,
    world.width,
    world.height,
    maxDepthDistancePx,
    depthPower
  )
  const widthMeters = world.width * world.cellSize
  const heightMeters = world.height * world.cellSize
  const geometry = new THREE.PlaneGeometry(widthMeters, heightMeters, 180, 180)
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uWaveSpeed: { value: Number(options.waveSpeed ?? 0.65) },
      uWaveAmplitude: { value: Number(options.waveAmplitude ?? Math.max(world.objectSize * 0.02, 0.05)) },
      uWaveScale: { value: Number(options.waveScale ?? 0.009) },
      uWaterMap: { value: waterMap },
      uTexelSize: { value: new THREE.Vector2(1 / world.width, 1 / world.height) },
      uShallowColor: { value: new THREE.Color(options.shallowColor ?? 0x6fd5ef) },
      uDeepColor: { value: new THREE.Color(options.deepColor ?? 0x2a62ad) },
      uSkyColor: { value: new THREE.Color(options.skyColor ?? 0xc7e0ff) },
      uCameraPos: { value: new THREE.Vector3() },
      uOpacityShallow: { value: Number(options.opacityShallow ?? 0.56) },
      uOpacityDeep: { value: Number(options.opacityDeep ?? 0.9) },
      uCoastSoftness: { value: Number(options.coastSoftness ?? 0.24) },
      uDaylight: { value: 1 },
      uMoonlight: { value: 0 },
      uFlowSpeed: { value: Number(options.flowSpeed ?? 0.92) },
      uFlowScale: { value: Number(options.flowScale ?? 1.18) },
      uFlowStrength: { value: Number(options.flowStrength ?? 1.6) },
    },
  ])
  const material = new THREE.ShaderMaterial({
    vertexShader: waterVertexShader,
    fragmentShader: waterFragmentShader,
    fog: true,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    uniforms,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = Number(options.yBase ?? world.objectSize * 0.1)
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  scene.add(mesh)
  return {
    instanceCount: sourceCount,
    sourceCount,
    update: (elapsedSeconds: number, camera: THREE.PerspectiveCamera, lighting: any = null) => {
      const uniforms = material.uniforms as any
      uniforms.uTime.value = elapsedSeconds
      uniforms.uCameraPos.value.copy(camera.position)
      if (lighting) {
        if (typeof lighting.daylight === 'number') {
          uniforms.uDaylight.value = Math.max(0, Math.min(1, lighting.daylight))
        }
        if (typeof lighting.moonlight === 'number') {
          uniforms.uMoonlight.value = Math.max(0, Math.min(1, lighting.moonlight))
        }
        if (lighting.skyColor?.isColor) {
          uniforms.uSkyColor.value.copy(lighting.skyColor)
        }
      }
    },
  }
}
