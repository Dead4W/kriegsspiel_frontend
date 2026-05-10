import * as THREE from 'three'
import { getUnitTexture } from '@/engine/assets/textures'
import { getUnitStringParam } from '@/engine/resourcePack/units'

export type TeamId = 'red' | 'blue' | 'neutral' | string

const UNIT_FLAG_TEXTURES = new Map<string, THREE.Texture>()
const TEAM_FLAG_TEXTURES = new Map<string, THREE.Texture>()

export const WHITE_FLAG_TEXTURE = createWhiteFlagTexture()

function createWhiteFlagTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(1, '#ececec')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'rgba(180, 180, 180, 0.28)'
  for (let i = 0; i < 8; i += 1) {
    const x = ((i * 17) % canvas.width) - 10
    ctx.fillRect(x, 0, 12, canvas.height)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

function createFallbackFlagCanvas(team: TeamId, resolveTeamColor: (team: TeamId) => number) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const color = new THREE.Color(resolveTeamColor(team))
  ctx.fillStyle = `#${color.getHexString()}`
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = 'rgba(255,255,255,0.72)'
  ctx.lineWidth = 7
  ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18)
  return canvas
}

export function getOrCreateUnitFlagTexture(
  unitType: string,
  team: TeamId,
  resolveTeamColor: (team: TeamId) => number
) {
  const cacheKey = `${team}:${unitType}`
  const cached = TEAM_FLAG_TEXTURES.get(cacheKey)
  if (cached) return cached

  const fallbackCanvas = createFallbackFlagCanvas(team, resolveTeamColor)
  const icon = getUnitStringParam(unitType, 'renderIcon').trim()
  const texture = new THREE.CanvasTexture(fallbackCanvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true

  const drawIcon = (source: CanvasImageSource | null) => {
    const ctx = fallbackCanvas.getContext('2d')!
    ctx.clearRect(0, 0, 128, 128)
    ctx.drawImage(createFallbackFlagCanvas(team, resolveTeamColor), 0, 0, 128, 128)
    if (source) {
      const iconCanvas = document.createElement('canvas')
      iconCanvas.width = 128
      iconCanvas.height = 128
      const iconCtx = iconCanvas.getContext('2d')!
      iconCtx.clearRect(0, 0, 128, 128)
      const sw = (source as any).width ?? (source as any).naturalWidth ?? 128
      const sh = (source as any).height ?? (source as any).naturalHeight ?? 128
      const iconFrame = 90
      const fit = THREE.MathUtils.clamp(
        Math.min(iconFrame / Math.max(1, sw), iconFrame / Math.max(1, sh)),
        0.01,
        4
      )
      const dw = Math.max(1, Math.round(sw * fit))
      const dh = Math.max(1, Math.round(sh * fit))
      const dx = Math.round((128 - dw) * 0.5)
      const dy = Math.round((128 - dh) * 0.5)
      iconCtx.drawImage(source, dx, dy, dw, dh)
      iconCtx.globalCompositeOperation = 'source-in'
      iconCtx.fillStyle = '#ffffff'
      iconCtx.fillRect(0, 0, 128, 128)
      try {
        const imageData = iconCtx.getImageData(0, 0, 128, 128)
        const data = imageData.data
        for (let p = 0; p < data.length; p += 4) {
          const alpha = data[p + 3] ?? 0
          if (alpha < 12) {
            data[p + 3] = 0
            continue
          }
          data[p] = 255
          data[p + 1] = 255
          data[p + 2] = 255
          data[p + 3] = 255
        }
        iconCtx.putImageData(imageData, 0, 0)
      } catch {
        // Cross-origin textures may block pixel reads; keep the already drawn icon.
      }
      iconCtx.globalCompositeOperation = 'source-over'
      iconCtx.strokeStyle = 'rgba(255,255,255,0.95)'
      iconCtx.lineWidth = 3
      iconCtx.strokeRect(9, 9, 110, 110)
      ctx.drawImage(iconCanvas, 0, 0)
    } else if (icon) {
      ctx.fillStyle = '#ffffff'
      ctx.font = '800 102px system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(icon, 64, 72)
    }
    texture.needsUpdate = true
  }

  const image = getUnitTexture(unitType)
  if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    drawIcon(image)
  } else if (icon) {
    drawIcon(null)
  } else {
    image.addEventListener('load', () => {
      if (!(image.naturalWidth > 0) || !(image.naturalHeight > 0)) return
      drawIcon(image)
    })
  }

  UNIT_FLAG_TEXTURES.set(unitType, texture)
  TEAM_FLAG_TEXTURES.set(cacheKey, texture)
  return texture
}

export type UnitUiVisual = {
  flagRoot: THREE.Group
  flagCloth: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  flagMaterial: THREE.MeshBasicMaterial
  barsRoot: THREE.Group
  hpBarFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  ammoBarFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  ammoBarBackground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  baseFlagY: number
}

export function createUnitUi(objectSize: number) {
  const flagW = objectSize * 6.0
  const flagH = objectSize * 6.0
  const flagBaseY = objectSize * 12.4
  const flagPoleHeight = flagBaseY + flagH * 1.05
  const flagRoot = new THREE.Group()
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(objectSize * 0.08, objectSize * 0.08, flagPoleHeight, 8),
    new THREE.MeshStandardMaterial({ color: 0x6f6f73, roughness: 0.8, metalness: 0.2 })
  )
  pole.position.set(0, flagPoleHeight * 0.5, -objectSize * 0.32)
  pole.castShadow = false
  const flagMaterial = new THREE.MeshBasicMaterial({
    map: WHITE_FLAG_TEXTURE,
    transparent: true,
    alphaTest: 0.02,
    color: 0xffffff,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  })
  const flagCloth = new THREE.Mesh(new THREE.PlaneGeometry(flagW, flagH, 1, 1), flagMaterial)
  flagCloth.position.set(0, flagBaseY + flagH * 0.2, objectSize * 0.06)
  flagCloth.renderOrder = 80
  flagCloth.castShadow = false
  flagRoot.add(pole)
  flagRoot.add(flagCloth)

  const barsRoot = new THREE.Group()
  const barWidth = flagW * 0.92
  const barHeight = objectSize * 0.48
  const barGap = objectSize * 0.12
  const barBaseY = flagBaseY - flagH * 0.62
  const makeBarMaterial = (color: number, opacity: number) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: true,
    })
  const hpBarBackground = new THREE.Mesh(
    new THREE.PlaneGeometry(barWidth, barHeight, 1, 1),
    makeBarMaterial(0x000000, 0.62)
  )
  hpBarBackground.position.set(0, barBaseY, objectSize * 0.04)
  hpBarBackground.renderOrder = 70
  const hpBarFill = new THREE.Mesh(
    new THREE.PlaneGeometry(barWidth, barHeight, 1, 1),
    makeBarMaterial(0x22c55e, 1)
  )
  hpBarFill.position.set(0, barBaseY, objectSize * 0.045)
  hpBarFill.renderOrder = 71
  const ammoBarBackground = new THREE.Mesh(
    new THREE.PlaneGeometry(barWidth, barHeight, 1, 1),
    makeBarMaterial(0x000000, 0.62)
  )
  ammoBarBackground.position.set(0, barBaseY - (barHeight + barGap), objectSize * 0.04)
  ammoBarBackground.renderOrder = 70
  const ammoBarFill = new THREE.Mesh(
    new THREE.PlaneGeometry(barWidth, barHeight, 1, 1),
    makeBarMaterial(0xff8a00, 1)
  )
  ammoBarFill.position.set(0, barBaseY - (barHeight + barGap), objectSize * 0.045)
  ammoBarFill.renderOrder = 71
  barsRoot.add(hpBarBackground)
  barsRoot.add(hpBarFill)
  barsRoot.add(ammoBarBackground)
  barsRoot.add(ammoBarFill)
  flagRoot.add(barsRoot)

  return {
    flagRoot,
    flagCloth,
    flagMaterial,
    barsRoot,
    hpBarFill,
    ammoBarFill,
    ammoBarBackground,
    baseFlagY: flagBaseY,
  } satisfies UnitUiVisual
}
