import * as THREE from 'three'

const DEFAULT_SUN_TIME_HOURS = 14

function parseTimeHours(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const clean = value.trim()
  if (!clean) return null
  const dateTimeMatch = clean.match(
    /^\d{4}-\d{2}-\d{2}[ T](\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?(?:\.\d+)?(?:Z)?$/
  )
  if (dateTimeMatch) {
    const hours = Number(dateTimeMatch[1])
    const minutes = Number(dateTimeMatch[2] ?? 0)
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
    return hours + minutes / 60
  }
  const match = clean.match(/^(\d{1,2})(?::(\d{1,2}))?$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2] ?? 0)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours + minutes / 60
}

function normalizeHours(hours: number) {
  const mod = hours % 24
  return mod < 0 ? mod + 24 : mod
}

export function resolveSunTimeHours(meta: Record<string, any>) {
  const candidate = parseTimeHours(meta?.time ?? meta?.sunTime ?? meta?.timeHours)
  return normalizeHours(candidate ?? DEFAULT_SUN_TIME_HOURS)
}

export function resolveSunTimeHoursFromWorldTime(worldTime: unknown) {
  const candidate = parseTimeHours(worldTime)
  return normalizeHours(candidate ?? DEFAULT_SUN_TIME_HOURS)
}

export function createSunSystem({ scene }: { scene: THREE.Scene }) {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.2)
  scene.add(ambientLight)
  const sun = new THREE.DirectionalLight(0xfff0d3, 1.0)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  // Keep small fixed bias values: scale-based bias was causing floating shadows
  // on large cell sizes (buildings/trees looked detached from the ground).
  sun.shadow.bias = -0.00008
  sun.shadow.normalBias = 0.0014
  sun.shadow.camera.near = 8
  sun.shadow.camera.far = 9000
  sun.shadow.camera.left = -1200
  sun.shadow.camera.right = 1200
  sun.shadow.camera.top = 1200
  sun.shadow.camera.bottom = -1200
  scene.add(sun)
  scene.add(sun.target)
  const moon = new THREE.DirectionalLight(0xaec8ff, 0.0)
  scene.add(moon)
  const dayFog = new THREE.Color(0x86a7df)
  const sunsetFog = new THREE.Color(0xab7a67)
  const nightFog = new THREE.Color(0x121a2b)
  const temp = new THREE.Color()
  const sunColor = new THREE.Color()
  let stableShadowExtent = 1400
  return {
    update: ({
      world,
      sunTimeHours,
      camera,
    }: {
      world: { width: number; height: number; cellSize: number }
      sunTimeHours: number
      camera: THREE.PerspectiveCamera
    }) => {
      const dayAngle = ((sunTimeHours - 6) / 12) * Math.PI
      const sunElevation = Math.sin(dayAngle)
      const daylight = Math.max(0, sunElevation)
      const moonlight = Math.max(0, -sunElevation)
      const twilight = Math.max(0, 1 - Math.min(1, Math.abs(sunElevation) / 0.36))
      const worldSpan = Math.max(world.width, world.height) * world.cellSize
      const distance = Math.max(400, worldSpan * 1.15)
      const lightTargetX = camera.position.x
      const lightTargetZ = camera.position.z
      const horizontalX = -Math.sin(dayAngle)
      const horizontalZ = Math.cos(dayAngle)
      const worldSpanExtent = Math.max(900, Math.min(6200, worldSpan * 1.05))
      const cameraDrivenExtent = THREE.MathUtils.clamp(
        Math.max(camera.position.y * 28, world.cellSize * 260),
        700,
        Math.max(1600, worldSpan * 0.75)
      )
      const desiredShadowExtent = Math.max(worldSpanExtent * 0.65, cameraDrivenExtent)
      if (Math.abs(desiredShadowExtent - stableShadowExtent) > stableShadowExtent * 0.1) {
        stableShadowExtent = THREE.MathUtils.lerp(stableShadowExtent, desiredShadowExtent, 0.2)
      }
      const mapResolution = Math.max(1, sun.shadow.mapSize.x)
      const shadowTexelWorldSize = (stableShadowExtent * 2) / mapResolution
      const snappedTargetX = Math.round(lightTargetX / shadowTexelWorldSize) * shadowTexelWorldSize
      const snappedTargetZ = Math.round(lightTargetZ / shadowTexelWorldSize) * shadowTexelWorldSize
      const x = horizontalX * distance
      const y = Math.max(world.cellSize * 10, sunElevation * distance)
      const z = horizontalZ * distance
      sun.position.set(snappedTargetX + x, y, snappedTargetZ + z)
      sun.target.position.set(snappedTargetX, world.cellSize * 2, snappedTargetZ)
      sun.target.updateMatrixWorld()
      const shadowExtent = stableShadowExtent
      sun.shadow.camera.left = -shadowExtent
      sun.shadow.camera.right = shadowExtent
      sun.shadow.camera.top = shadowExtent
      sun.shadow.camera.bottom = -shadowExtent
      sun.shadow.camera.near = 0.1
      sun.shadow.camera.far = Math.max(2200, distance * 2.6)
      sun.shadow.camera.updateProjectionMatrix()
      sun.intensity = daylight * 1.15
      sun.visible = daylight > 0.001
      sun.color.copy(sunColor.setHSL(0.11, 0.52, 0.52 + daylight * 0.3))
      moon.position.set(lightTargetX - x, -y, lightTargetZ - z)
      moon.intensity = moonlight * 0.11
      ambientLight.intensity = 0.035 + daylight * 0.3 + twilight * 0.06 + moonlight * 0.045
      if (scene?.fog?.color) {
        temp.copy(nightFog).lerp(dayFog, daylight)
        temp.lerp(sunsetFog, twilight * 0.65)
        scene.fog.color.copy(temp)
      }
      return {
        sunPosition: sun.position.clone(),
        daylight,
        moonlight,
        twilight,
        skyColor:
          scene?.fog?.color ?? (scene.background instanceof THREE.Color ? scene.background : new THREE.Color(0x8cb0ff)),
      }
    },
  }
}

