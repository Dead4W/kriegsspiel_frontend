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
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";
import {type TimeOfDay} from "@/engine/resourcePack/timeOfDay.ts";
import { getTimeOfDayIdByHour } from "@/engine/resourcePack/timeOfDay.ts";
import type {Weather} from "@/engine/resourcePack/weather.ts";

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

  heightMap?: HeightSampler
  heightMapCanvas?: OffscreenCanvas | HTMLCanvasElement
  heightMapCtx?: OffscreenCanvasRenderingContext2D | RenderingContext

  camera = new camera()
  units = new unitregistry()

  overlay = new overlaystate()

  paint = new paintstate()

  messages = new messageregistry()

  cursor = new cursorregistry()

  logs: Ref<BattleLogEntry[]> = ref<BattleLogEntry[]>([])

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
}
