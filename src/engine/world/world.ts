import type {unitstate, uuid} from '@/engine/units/types'
import {emitter} from '../events'
import {camera} from './camera'
import {unitregistry} from './unitregistry'
import {overlaystate} from "@/engine/world/overlay.ts";
import type {OverlayItem} from "@/engine/types/overlayTypes.ts";
import type {mapmeta, vec2} from "@/engine/types.ts";
import {messageregistry} from "@/engine/world/messageregistry"
import type {ChatMessage} from "@/engine/types/chatMessage.ts";
import {cursorregistry} from "@/engine/world/cursorregistry.ts";
import {createHeightSampler, type HeightSampler} from "@/engine/assets/heightmap.ts";
import {RoomGameStage} from "@/enums/roomStage.ts";
import type {OutMessage} from "@/api/socket.ts";
import {type Ref, ref} from "vue";
import type {BattleLogEntry} from "@/engine/types/logType.ts";
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";
import {TimeOfDay} from "@/engine/units/modifiers/UnitTimeModifiers.ts";
import {WeatherEnum} from "@/engine/units/modifiers/UnitWeatherModifiers.ts";

type worldevents = {
  changed: { reason: string }
  changed_overlay: { reason: string }
  api: OutMessage
  camera: {}
}

export class world {
  id: uuid = '';
  time: string = '1882-06-12 09:00:00';

  // Блокировка сокета на отправку/приёмку событий
  socketLock: boolean = false;

  stage: RoomGameStage = RoomGameStage.PLANNING;

  events = new emitter<worldevents>()

  weather: Ref<WeatherEnum> = ref(WeatherEnum.Clear);
  newWeather: Ref<WeatherEnum> = ref(WeatherEnum.Clear);

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

  messages = new messageregistry()

  cursor = new cursorregistry()

  logs: Ref<BattleLogEntry[]> = ref<BattleLogEntry[]>([])

  constructor(map: mapmeta) {
    this.map = map
    this.camera.setWorldSize(map.width, map.height)
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
    if (!seconds || seconds <= 0) return

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
      messageSound.play();
    }
  }

  setStage(stage: RoomGameStage) {
    this.stage = stage;
    this.events.emit('api', { type: 'set_stage', data: stage});
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

    if (h >= 9 && h < 12) return TimeOfDay.Morning
    if (h >= 12 && h < 18) return TimeOfDay.Day
    if (h >= 18 && h < 22) return TimeOfDay.Evening
    return TimeOfDay.Night
  }

  getHeightAt(pos: vec2) {
    if (!this.heightMap) return 0
    return this.heightMap.getHeightAt(pos)
  }
}
