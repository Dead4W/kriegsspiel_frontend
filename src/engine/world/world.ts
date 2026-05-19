import type {unitstate, uuid} from '@/engine/units/types'
import {emitter} from '../events'
import {camera} from './camera'
import {unitregistry} from './unitregistry'
import {overlaystate} from "@/engine/world/overlay.ts";
import {paintstate} from "@/engine/world/paint.ts";
import type {OverlayItem} from "@/engine/types/overlayTypes.ts";
import type {PaintStroke} from "@/engine/types/paintTypes.ts";
import type {mapmeta, vec2} from "@/engine/types.ts";
import {messageregistry} from "@/engine/world/messageregistry"
import type {ChatMessage} from "@/engine/types/chatMessage.ts";
import {cursorregistry} from "@/engine/world/cursorregistry.ts";
import {createHeightSampler, type HeightSampler} from "@/engine/assets/heightmap.ts";
import {RoomGameStage} from "@/enums/roomStage.ts";
import type {OutMessage} from "@/api/socket.ts";
import {type Ref, ref, watch} from "vue";
import type {BattleLogEntry} from "@/engine/types/logType.ts";
import type {ConnectionInfo} from "@/engine/types/connectionTypes.ts";
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";
import {type TimeOfDay} from "@/engine/resourcePack/timeOfDay.ts";
import { getTimeOfDayIdByHour } from "@/engine/resourcePack/timeOfDay.ts";
import type {Weather} from "@/engine/resourcePack/weather.ts";
import {Team} from "@/enums/teamKeys.ts";
import type {PlayerReadyInfo} from "@/engine/types/connectionTypes.ts";
import type {DirectViewObjectState} from "@/engine/types/directViewObjects.ts";

type worldevents = {
  changed: { reason: string }
  changed_overlay: { reason: string }
  api: OutMessage
  force_api: {}
  camera: {}
}

export class world {
  id: uuid = '';
  time: string = '1882-06-12 09:00:00';

  // Блокировка сокета на отправку/приёмку событий
  socketLock: boolean = false;

  stage: RoomGameStage = RoomGameStage.PLANNING;

  events = new emitter<worldevents>()

  weather: Ref<Weather> = ref('clear');
  newWeather: Ref<Weather> = ref('clear');

  map: mapmeta

  forestCanvas?: OffscreenCanvas | HTMLCanvasElement
  forestCtx?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  forestImageData?: ImageData

  objectMapCanvas?: OffscreenCanvas | HTMLCanvasElement
  objectMapCtx?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  objectMapImageData?: ImageData
  objectMapColorToEntity: Map<string, string> = new Map()

  heightMap?: HeightSampler
  heightMapCanvas?: OffscreenCanvas | HTMLCanvasElement
  heightMapCtx?: OffscreenCanvasRenderingContext2D | RenderingContext

  camera = new camera()
  units = new unitregistry()

  overlay = new overlaystate()

  paint = new paintstate()

  messages = new messageregistry()

  cursor = new cursorregistry()

  directViewObjects: Ref<DirectViewObjectState[]> = ref<DirectViewObjectState[]>([])

  logs: Ref<BattleLogEntry[]> = ref<BattleLogEntry[]>([])
  connections: Ref<ConnectionInfo[]> = ref<ConnectionInfo[]>([])
  playerReadyStates: Ref<PlayerReadyInfo[]> = ref<PlayerReadyInfo[]>([])

  constructor(map: mapmeta) {
    this.map = map
    this.camera.setWorldSize(map.width, map.height)

    // watch(
    //   () => this.logs.value.length,
    //   (newLen, oldLen) => {
    //     if (newLen > oldLen) {
    //       const newEntries = this.logs.value.slice(oldLen)
    //       for (const entry of newEntries) {
    //         entry.is_new = false;
    //         window.ROOM_WORLD.events.emit('api', {type: 'log', data: entry});
    //       }
    //     }
    //   }
    // )
  }

  addUnits(states: unitstate[]) {
    for (const s of states) this.units.upsert(s)
    this.events.emit('changed', { reason: 'units' })
  }

  addMessage(message: ChatMessage) {
    this.messages.upsert(message);
    this.events.emit('changed', { reason: 'chat' });
  }

  setDirectViewObjects(items: DirectViewObjectState[]) {
    this.directViewObjects.value = items
  }

  setViewport(w: number, h: number) {
    this.camera.setViewport(w, h);
    // this.events.emit('changed', { reason: 'viewport' })
  }

  setOverlay(item: OverlayItem[]) {
    this.overlay.set(item)
    this.events.emit('changed', { reason: 'overlay' })
  }

  addOverlay(item: OverlayItem) {
    this.overlay.add(item)
    this.events.emit('changed', { reason: 'overlay' })
  }

  clearOverlay() {
    this.overlay.clear()
    this.events.emit('changed', { reason: 'overlay' })
  }

  addPaintStroke(stroke: PaintStroke, source: 'local' | 'remote' = 'local') {
    this.paint.add(stroke, source)
    this.events.emit('changed', { reason: 'paint' })
  }

  markPaintStrokeDirty(id: string) {
    this.paint.markDirty(id)
  }

  removePaintStrokeById(id: string) {
    const removed = this.paint.removeById(id)
    if (removed) this.events.emit('changed', { reason: 'paint' })
    return removed
  }

  undoPaint(ownerId?: string) {
    const removed = ownerId ? this.paint.undoByOwner(ownerId) : this.paint.undo()
    this.events.emit('changed', { reason: 'paint' })
    return removed
  }

  clearPaint() {
    this.paint.clear()
    this.events.emit('changed', { reason: 'paint' })
  }

  touchPaint() {
    this.paint.touch()
  }

  setForestMap(map: OffscreenCanvas | HTMLCanvasElement) {
    this.forestCanvas = map;
    this.forestCtx = this.forestCanvas.getContext(
      '2d'
    ) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
    this.forestImageData = this.forestCtx.getImageData(
      0,
      0,
      this.forestCanvas.width,
      this.forestCanvas.height
    )
    this.events.emit('changed', { reason: 'forestMap' })
  }

  setObjectMap(
    map: ImageBitmap | OffscreenCanvas | HTMLCanvasElement,
    meta: Record<string, unknown>
  ) {
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(this.map.width, this.map.height)
        : Object.assign(document.createElement('canvas'), { width: this.map.width, height: this.map.height })
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!ctx) return
    // Align object-map coordinates with world coordinates.
    // @ts-ignore
    ctx.drawImage(map, 0, 0, this.map.width, this.map.height)
    const imageData = ctx.getImageData(0, 0, this.map.width, this.map.height)

    const nextMap = new Map<string, string>()
    const entityToColorRaw =
      meta && typeof meta === 'object' ? (meta.entity_to_color as Record<string, unknown>) : null
    if (entityToColorRaw && typeof entityToColorRaw === 'object') {
      for (const entity of Object.keys(entityToColorRaw)) {
        const rawColor = entityToColorRaw[entity]
        if (!Array.isArray(rawColor) || rawColor.length < 3) continue
        const r = Number(rawColor[0])
        const g = Number(rawColor[1])
        const b = Number(rawColor[2])
        if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue
        nextMap.set(
          `${Math.max(0, Math.min(255, Math.round(r)))},${Math.max(0, Math.min(255, Math.round(g)))},${Math.max(0, Math.min(255, Math.round(b)))}`,
          String(entity)
        )
      }
    }

    this.objectMapCanvas = canvas
    this.objectMapCtx = ctx
    this.objectMapImageData = imageData
    this.objectMapColorToEntity = nextMap
    this.events.emit('changed', { reason: 'objectMap' })
  }

  getObjectMapEntityAt(pos: vec2): string | null {
    if (!this.objectMapImageData || !this.objectMapColorToEntity.size) return null
    const x = Math.round(pos.x)
    const y = Math.round(pos.y)
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return null
    const idx = (y * this.map.width + x) * 4
    const pixels = this.objectMapImageData.data
    const key = `${pixels[idx]},${pixels[idx + 1]},${pixels[idx + 2]}`
    return this.objectMapColorToEntity.get(key) ?? null
  }

  isObjectEntityAt(pos: vec2, entity: string): boolean {
    return this.getObjectMapEntityAt(pos) === entity
  }

  findNearestObjectPoint(
    pos: vec2,
    entities: string[],
    maxRadiusPx: number = 12
  ): vec2 | null {
    if (!this.objectMapImageData || !this.objectMapColorToEntity.size || !entities.length) return null
    const targets = new Set(entities.map((item) => String(item)))
    const startX = Math.round(pos.x)
    const startY = Math.round(pos.y)
    if (startX < 0 || startY < 0 || startX >= this.map.width || startY >= this.map.height) return null

    const data = this.objectMapImageData.data
    const radius = Math.max(0, Math.round(maxRadiusPx))
    let bestDistSq = Infinity
    let bestX = -1
    let bestY = -1

    for (let dy = -radius; dy <= radius; dy += 1) {
      const y = startY + dy
      if (y < 0 || y >= this.map.height) continue
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = startX + dx
        if (x < 0 || x >= this.map.width) continue
        const distSq = dx * dx + dy * dy
        if (distSq > radius * radius || distSq >= bestDistSq) continue
        const idx = (y * this.map.width + x) * 4
        const key = `${data[idx]},${data[idx + 1]},${data[idx + 2]}`
        const entity = this.objectMapColorToEntity.get(key)
        if (!entity || !targets.has(entity)) continue
        bestDistSq = distSq
        bestX = x
        bestY = y
      }
    }

    if (bestX < 0 || bestY < 0) return null
    return { x: bestX, y: bestY }
  }

  hasObjectEntityOnSegment(from: vec2, to: vec2, entity: string, sampleStepPx: number = 2): boolean {
    if (!this.objectMapImageData || !this.objectMapColorToEntity.size) return false
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    if (length === 0) return this.isObjectEntityAt(from, entity)
    const step = Math.max(1, sampleStepPx)
    const samples = Math.max(1, Math.ceil(length / step))
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples
      if (
        this.isObjectEntityAt(
          {
            x: from.x + dx * t,
            y: from.y + dy * t,
          },
          entity
        )
      ) {
        return true
      }
    }
    return false
  }

  private getObjectMapEntityAtPixel(x: number, y: number): string | null {
    if (!this.objectMapImageData || !this.objectMapColorToEntity.size) return null
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return null
    const idx = (y * this.map.width + x) * 4
    const pixels = this.objectMapImageData.data
    const key = `${pixels[idx]},${pixels[idx + 1]},${pixels[idx + 2]}`
    return this.objectMapColorToEntity.get(key) ?? null
  }

  findNearestObjectComponentCenter(
    pos: vec2,
    entities: string[],
    maxRadiusPx: number = 24
  ): { center: vec2; entity: string } | null {
    const seed = this.findNearestObjectPoint(pos, entities, maxRadiusPx)
    if (!seed) return null

    const seedX = Math.round(seed.x)
    const seedY = Math.round(seed.y)
    const seedEntity = this.getObjectMapEntityAtPixel(seedX, seedY)
    if (!seedEntity) return null

    const allowedEntities = new Set(entities.map((item) => String(item)))
    if (!allowedEntities.has(seedEntity)) return null

    const width = this.map.width
    const height = this.map.height
    const queue: Array<[number, number]> = [[seedX, seedY]]
    const visited = new Set<number>([seedY * width + seedX])

    let sumX = 0
    let sumY = 0
    let count = 0

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]

    while (queue.length) {
      const [x, y] = queue.pop()!
      const entity = this.getObjectMapEntityAtPixel(x, y)
      if (entity !== seedEntity) continue

      sumX += x
      sumY += y
      count += 1

      for (let i = 0; i < dirs.length; i += 1) {
        const nx = x + dirs[i]![0]!
        const ny = y + dirs[i]![1]!
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const nIndex = ny * width + nx
        if (visited.has(nIndex)) continue
        visited.add(nIndex)
        queue.push([nx, ny])
      }
    }

    if (count === 0) return null

    return {
      center: {
        x: sumX / count,
        y: sumY / count,
      },
      entity: seedEntity,
    }
  }

  findNearestObjectLocalCenter(
    pos: vec2,
    entities: string[],
    maxRadiusPx: number = 24,
    localRadiusPx: number = 10
  ): { center: vec2; entity: string } | null {
    const seed = this.findNearestObjectPoint(pos, entities, maxRadiusPx)
    if (!seed) return null

    const seedEntity = this.getObjectMapEntityAt(seed)
    if (!seedEntity) return null
    const allowedEntities = new Set(entities.map((item) => String(item)))
    if (!allowedEntities.has(seedEntity)) return null

    const radius = Math.max(1, Math.round(localRadiusPx))
    const seedX = Math.round(seed.x)
    const seedY = Math.round(seed.y)

    let sumX = 0
    let sumY = 0
    let count = 0

    for (let dy = -radius; dy <= radius; dy += 1) {
      const y = seedY + dy
      if (y < 0 || y >= this.map.height) continue
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = seedX + dx
        if (x < 0 || x >= this.map.width) continue
        if (dx * dx + dy * dy > radius * radius) continue

        const entity = this.getObjectMapEntityAt({ x, y })
        if (entity !== seedEntity) continue
        sumX += x
        sumY += y
        count += 1
      }
    }

    if (count === 0) return null
    return {
      center: {
        x: sumX / count,
        y: sumY / count,
      },
      entity: seedEntity,
    }
  }

  async setHeightMap(bitmap: ImageBitmap) {
    this.heightMapCanvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(this.map.width, this.map.height)
        : Object.assign(document.createElement('canvas'), { width: this.map.width, height: this.map.height })

    this.heightMapCtx = this.heightMapCanvas.getContext('2d')!
    // @ts-ignore
    this.heightMapCtx.drawImage(bitmap, 0, 0, this.map.width, this.map.height)

    // @ts-ignore
    const img = this.heightMapCtx.getImageData(0, 0, this.map.width, this.map.height)

    this.heightMap = await createHeightSampler(img.data, this.map.width, this.map.height);
  }

  skipTime(seconds: number, update: boolean = true) {
    if (!seconds || seconds <= 0) seconds = 0

    // приводим строку к Date
    const date = new Date(this.time.replace(' ', 'T'))

    // увеличиваем время
    date.setSeconds(date.getSeconds() + seconds)

    // обратно в строку YYYY-MM-DD HH:mm:ss
    const pad = (v: number) => v.toString().padStart(2, '0')

    this.time = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

    if (update) this.events.emit('api', { type: 'skip_time', data: this.time});
  }

  updateTime(time: string) {
    this.time = time;
    if (this.stage !== RoomGameStage.END) {
      const messageSound = new Audio('/assets/sounds/message.wav')
      messageSound.volume = window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SOUND_VOLUME] ?? 0.3
      messageSound.play().catch(() => {})
    }
  }

  setStage(stage: RoomGameStage) {
    this.stage = stage;
    this.events.emit('api', { type: 'set_stage', data: stage});
    this.events.emit('changed', { reason: 'stage' });
  }

  clear() {
    this.units = new unitregistry()
    this.directViewObjects.value = []
    this.clearOverlay()
    // this.messages = new messageregistry()
    this.cursor = new cursorregistry()
    this.logs.value = []
  }

  getTimeOfDay(): TimeOfDay {
    const date = new Date(this.time.replace(' ', 'T'))
    const h = date.getHours()
    return getTimeOfDayIdByHour(h)
  }

  getHeightAt(pos: vec2) {
    if (!this.heightMap) return 0
    return this.heightMap.getHeightAt(pos)
  }

  upsertPlayerReadyState(state: PlayerReadyInfo) {
    const idx = this.playerReadyStates.value.findIndex(
      (item) => item.user_id === state.user_id && item.team === state.team
    )
    if (idx >= 0) {
      this.playerReadyStates.value[idx] = {
        user_id: state.user_id,
        user: state.user ?? this.playerReadyStates.value[idx]?.user,
        team: state.team,
        is_ready: state.is_ready,
      }
      return
    }
    this.playerReadyStates.value.push(state)
  }

  getPlayerReadyStats() {
    const candidates = this.playerReadyStates.value.filter(
      (state) => state.team === Team.RED || state.team === Team.BLUE
    )
    const seen = new Set<string>()
    let total = 0;
    let ready = 0;
    for (const state of candidates) {
      const key = `${state.team}:${state.user_id}`
      if (seen.has(key)) continue
      seen.add(key)
      total++
      if (state.is_ready) {
        ready++
      }
    }
    return {
      ready,
      total,
    }
  }
}
