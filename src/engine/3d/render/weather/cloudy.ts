import * as THREE from 'three'

export type CloudyWeatherLayer = {
  update(params: {
    camera: THREE.PerspectiveCamera
    elapsedSeconds: number
    enabled: boolean
    daylight: number
  }): void
  dispose(): void
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

uniform float uTime;
uniform float uEnabled;
uniform float uOpacity;
uniform float uDaylight;

float hash31(vec3 p) {
  p = fract(p * vec3(0.1031, 0.11369, 0.13787));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);

  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, u.x);
  float nx10 = mix(n010, n110, u.x);
  float nx01 = mix(n001, n101, u.x);
  float nx11 = mix(n011, n111, u.x);
  float nxy0 = mix(nx00, nx10, u.y);
  float nxy1 = mix(nx01, nx11, u.y);
  return mix(nxy0, nxy1, u.z);
}

float fbm3(vec3 p) {
  float value = 0.0;
  float amplitude = 0.6;
  float frequency = 1.0;
  for (int i = 0; i < 5; i++) {
    value += noise3(p * frequency) * amplitude;
    frequency *= 2.0;
    amplitude *= 0.52;
  }
  return value;
}

void main() {
  if (uEnabled <= 0.0001 || uOpacity <= 0.0001) {
    discard;
  }

  vec3 dir = normalize(vWorldDirection);
  float skyMask = smoothstep(-0.06, 0.2, dir.y);
  if (skyMask <= 0.001) {
    discard;
  }

  vec3 wind = vec3(uTime * 0.014, uTime * 0.0065, uTime * 0.0095);
  vec3 baseP = dir * 4.6 + wind;
  float layerA = fbm3(baseP);
  float layerB = fbm3(baseP * 1.9 - wind * 0.75);
  float clouds = mix(layerA, layerB, 0.38);
  clouds = smoothstep(0.5, 0.86, clouds);

  float daylightFade = 0.42 + clamp(uDaylight, 0.0, 1.0) * 0.58;
  float alpha = clouds * skyMask * uOpacity * uEnabled * daylightFade;

  vec3 cloudColor = mix(vec3(0.62, 0.66, 0.72), vec3(0.94, 0.95, 0.98), clamp(layerA + uDaylight * 0.2, 0.0, 1.0));
  gl_FragColor = vec4(cloudColor, alpha);
}
`

export function createCloudyWeatherLayer(scene: THREE.Scene): CloudyWeatherLayer {
  const uniforms = {
    uTime: { value: 0 },
    uEnabled: { value: 0 },
    uOpacity: { value: 0.46 },
    uDaylight: { value: 1 },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    side: THREE.BackSide,
  })

  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), material)
  dome.frustumCulled = false
  dome.renderOrder = -9_000
  scene.add(dome)

  return {
    update({ camera, elapsedSeconds, enabled, daylight }) {
      uniforms.uTime.value = Math.max(0, elapsedSeconds)
      uniforms.uEnabled.value = enabled ? 1 : 0
      uniforms.uDaylight.value = THREE.MathUtils.clamp(daylight, 0, 1)
      const domeRadius = Math.max(500, camera.far * 0.86)
      dome.scale.setScalar(domeRadius)
      dome.position.copy(camera.position)
      dome.visible = enabled
    },
    dispose() {
      scene.remove(dome)
      dome.geometry.dispose()
      material.dispose()
    },
  }
}
