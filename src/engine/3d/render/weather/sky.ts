import * as THREE from 'three'
import type { ResourcePackWeatherEffect } from '@/engine/resourcePack/weather'

export type SkyLayer = {
  update(params: {
    camera: THREE.PerspectiveCamera
    sunPosition: THREE.Vector3
    daylight: number
    twilight: number
    weatherEffect: ResourcePackWeatherEffect | null
  }): void
  dispose(): void
}

function smoothstep(edge0: number, edge1: number, x: number) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

const VERTEX_SHADER = `
varying vec3 vWorldDirection;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

const FRAGMENT_SHADER = `
precision highp float;

varying vec3 vWorldDirection;

uniform vec3 uTopColor;
uniform vec3 uHorizonColor;
uniform vec3 uBottomColor;
uniform vec3 uSunDirection;
uniform float uSunGlow;
uniform float uCloudiness;

void main() {
  float y = clamp(vWorldDirection.y * 0.5 + 0.5, 0.0, 1.0);
  float horizonBand = smoothstep(0.18, 0.68, y);
  vec3 sky = mix(uBottomColor, uHorizonColor, horizonBand);
  sky = mix(sky, uTopColor, smoothstep(0.45, 1.0, y));

  float sunDot = max(0.0, dot(normalize(vWorldDirection), normalize(uSunDirection)));
  float sunCore = pow(sunDot, 160.0);
  float sunHalo = pow(sunDot, 22.0);
  vec3 sunColor = vec3(1.0, 0.78, 0.44) * (sunCore * 0.62 + sunHalo * 0.35) * uSunGlow;

  float haze = smoothstep(0.1, 0.55, 1.0 - y) * uCloudiness * 0.28;
  sky = mix(sky, vec3(0.76, 0.79, 0.84), haze);

  gl_FragColor = vec4(sky + sunColor, 1.0);
}
`

export function createSkyLayer(scene: THREE.Scene): SkyLayer {
  const uniforms = {
    uTopColor: { value: new THREE.Color(0x65a7ff) },
    uHorizonColor: { value: new THREE.Color(0xbdd7ff) },
    uBottomColor: { value: new THREE.Color(0x9ebbf5) },
    uSunDirection: { value: new THREE.Vector3(0.2, 0.9, 0.1).normalize() },
    uSunGlow: { value: 1 },
    uCloudiness: { value: 0 },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  })

  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), material)
  dome.frustumCulled = false
  dome.renderOrder = -10_000
  scene.add(dome)

  const topDay = new THREE.Color(0x66a9ff)
  const horizonDay = new THREE.Color(0xc8e2ff)
  const bottomDay = new THREE.Color(0x9cbcf8)
  const topSunset = new THREE.Color(0x4f7ccf)
  const horizonSunset = new THREE.Color(0xffaf72)
  const bottomSunset = new THREE.Color(0xc08174)
  const topNight = new THREE.Color(0x03050e)
  const horizonNight = new THREE.Color(0x03050e)
  const bottomNight = new THREE.Color(0x03050e)
  const mixColor = new THREE.Color()
  const computedFogColor = new THREE.Color()
  const hazeColor = new THREE.Color(0.76, 0.79, 0.84)
  const horizonSampleY = 0.5

  return {
    update({ camera, sunPosition, daylight, twilight, weatherEffect }) {
      const domeRadius = Math.max(400, camera.far * 0.9)
      dome.scale.setScalar(domeRadius)
      dome.position.copy(camera.position)

      const sunDirection = sunPosition.clone().sub(camera.position).normalize()
      uniforms.uSunDirection.value.copy(sunDirection)

      const dayWeight = THREE.MathUtils.clamp(daylight, 0, 1)
      const twilightWeight = THREE.MathUtils.clamp(twilight, 0, 1)
      const nightWeight = 1 - dayWeight

      mixColor.copy(topNight).lerp(topDay, dayWeight).lerp(topSunset, twilightWeight * 0.85)
      uniforms.uTopColor.value.copy(mixColor)
      mixColor.copy(horizonNight).lerp(horizonDay, dayWeight).lerp(horizonSunset, twilightWeight)
      uniforms.uHorizonColor.value.copy(mixColor)
      mixColor.copy(bottomNight).lerp(bottomDay, dayWeight).lerp(bottomSunset, twilightWeight * 0.8)
      uniforms.uBottomColor.value.copy(mixColor)

      uniforms.uSunGlow.value = 0.08 + dayWeight * 1.2 + twilightWeight * 0.35
      const cloudiness = weatherEffect?.type === 'clouds' ? 1 : 0
      uniforms.uCloudiness.value = cloudiness
      material.opacity = 1 - nightWeight * 0.04

      // Match fog with the horizon by reproducing the exact sky gradient math.
      const horizonBand = smoothstep(0.18, 0.68, horizonSampleY)
      computedFogColor.copy(uniforms.uBottomColor.value).lerp(uniforms.uHorizonColor.value, horizonBand)
      computedFogColor.lerp(uniforms.uTopColor.value, smoothstep(0.45, 1.0, horizonSampleY))
      const haze = smoothstep(0.1, 0.55, 1.0 - horizonSampleY) * cloudiness * 0.28
      computedFogColor.lerp(hazeColor, haze)
      if (scene.fog?.color) {
        scene.fog.color.copy(computedFogColor)
      }
    },
    dispose() {
      scene.remove(dome)
      dome.geometry.dispose()
      material.dispose()
    },
  }
}
