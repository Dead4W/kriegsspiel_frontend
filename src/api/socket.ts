import {type commandstate, type unitstate, unitType, type uuid} from '@/engine/units/types'
import type {MoveFrame} from '@/engine/types.ts'
import {world} from '@/engine/world/world.ts'
import {createRafInterval} from "@/engine/util.ts";
import {type ChatMessage, ChatMessageStatus} from "@/engine/types/chatMessage.ts";
import type {CursorObject} from "@/engine/world/cursorregistry.ts";
import {RoomGameStage} from "@/enums/roomStage.ts";
import {Team} from "@/enums/teamKeys.ts";
import type {unsub} from "@/engine/events.ts";
import type {BattleLogEntry} from "@/engine/types/logType.ts";
import type {PaintStroke} from "@/engine/types/paintTypes.ts";
import type {vec2} from "@/engine/types.ts";
import type {Weather} from "@/engine/resourcePack/weather.ts";
import type {ConnectionInfo} from "@/engine/types/connectionTypes.ts";
import type {DirectViewObjectState} from "@/engine/types/directViewObjects.ts";
import {createUnitCommand} from "@/engine/units/commands";

export type DirectViewUnitPacket = {
  unit: unitstate
  frames?: MoveFrame[]
}

export type OutMessage =
  | { type: 'room'; data: {ingame_time: string, stage: RoomGameStage, weather: Weather, options?: Record<string, unknown>, params?: Record<string, unknown>} }
  | { type: 'unit'; data: unitstate; frames?: MoveFrame[] }
  | { type: 'unit-remove'; data: uuid[] }
  | { type: 'paint_add'; data: PaintStroke }
  | { type: 'paint_undo'; data: { id: string } }
  | { type: 'ruler'; data: { points: vec2[] } }
  | { type: 'chat'; data: ChatMessage; meta?: {ignore?: boolean} }
  | { type: 'chat_edit'; data: { id: uuid; text: string } }
  | {
    type: 'chat_orders_update';
    data: {
      id: uuid;
      orders?: ChatMessage['orders'] | null;
    }
  }
  | { type: 'chat_read'; data: uuid[] }
  | { type: 'cursor'; data: CursorObject }
  | { type: 'skip_time'; data: string; live?: boolean; liveIntervalMs?: number; liveGameSecondsPerMinute?: number }
  | { type: 'skip_time_success'; data: true }
  | { type: 'set_stage'; data: RoomGameStage }
  | {
    type: 'messenger_delivery';
    data: {
      id: uuid
      roomUserIds: number[]
      time: string
      messengerId?: uuid
      quotedMessageId?: uuid | null
      deliveryStatus?: 'pending' | 'in_transit' | 'delivered' | 'failed' | 'intercepted'
    }
  }
  | {
    type: 'messenger_delivery_update';
    data: {
      id: uuid
      roomUserIds: number[]
      time: string
      messengerId?: uuid
      quotedMessageId?: uuid | null
      deliveryStatus?: 'pending' | 'in_transit' | 'delivered' | 'failed' | 'intercepted'
    }
  }
  | { type: 'direct_view'; team: Team; data: DirectViewUnitPacket[] }
  | { type: 'direct_view_objects'; team: Team; data: DirectViewObjectState[] }
  | { type: 'direct_view_send_order'; team?: Team; data: { unitId: uuid; commands: commandstate[] } }
  | { type: 'weather'; data: Weather }
  | { type: 'log'; data: BattleLogEntry }
  | { type: 'connection_new'; data: ConnectionInfo }
  | { type: 'connection_close'; data: { id: number } }
  | { type: 'room_user_ready'; data: { is_ready: boolean } | { user_id: number; user?: string; team: Team; is_ready: boolean } }
  | { type: 'room_params_update'; data: Record<string, unknown> }
  | { type: 'room_per_team_settings_update'; data: Record<string, unknown> }

export type InMessage =
  | { type: 'messages'; messages: OutMessage[] }
  | { type: 'error'; message: string }

const DEMO_BLOCKED_INCOMING_TYPES = new Set<OutMessage['type']>([
  'unit',
  'unit-remove',
  'paint_add',
  'paint_undo',
  'cursor',
  'skip_time',
  'set_stage',
  'direct_view',
  'direct_view_objects',
  'weather',
  'room',
])

let isDemoReadonlyMode = false

function clearUnitCommandsForDirectView(unit: unknown) {
  const mutableUnit = unit as { commands?: unknown[]; futurePos?: { x: number; y: number } | null }
  mutableUnit.commands = []
  mutableUnit.futurePos = null
}

function getFuturePosFromMoveCommands(commands: unknown): { x: number; y: number } | null {
  if (!Array.isArray(commands)) return null
  for (let i = commands.length - 1; i >= 0; i -= 1) {
    const command = commands[i] as { type?: unknown; state?: { target?: { x?: unknown; y?: unknown } } }
    if (command?.type !== 'move') continue
    const target = command.state?.target
    if (
      target
      && typeof target.x === 'number'
      && Number.isFinite(target.x)
      && typeof target.y === 'number'
      && Number.isFinite(target.y)
    ) {
      return { x: target.x, y: target.y }
    }
  }
  return null
}

function applyRoomParams(params: unknown) {
  if (!params || typeof params !== 'object') return
  window.ROOM_PARAMS ??= {}
  Object.assign(window.ROOM_PARAMS, params as Record<string, unknown>)
}

function extractPerTeamSettings(value: unknown): Record<string, Record<string, unknown>> | null {
  if (!value || typeof value !== 'object') return null
  const perTeamSettings = (value as Record<string, unknown>).perTeamSettings
  if (!perTeamSettings || typeof perTeamSettings !== 'object') return null
  return perTeamSettings as Record<string, Record<string, unknown>>
}

function syncRoomBriefingFromPerTeamSettings(perTeamSettings: Record<string, Record<string, unknown>> | null) {
  if (!perTeamSettings) return
  const redSettings = perTeamSettings[Team.RED]
  const blueSettings = perTeamSettings[Team.BLUE]
  const redBriefing = redSettings && typeof redSettings === 'object'
    ? (redSettings as Record<string, unknown>).briefing
    : undefined
  const blueBriefing = blueSettings && typeof blueSettings === 'object'
    ? (blueSettings as Record<string, unknown>).briefing
    : undefined
  window.ROOM_SETTINGS.teamBriefing = {
    [Team.RED]: typeof redBriefing === 'string' ? redBriefing : '',
    [Team.BLUE]: typeof blueBriefing === 'string' ? blueBriefing : '',
  }
  window.ROOM_SETTINGS.perTeamSettings = {
    ...(window.ROOM_SETTINGS.perTeamSettings || {}),
    ...perTeamSettings,
  }
}

function syncRoomSettingsFromParams(params: unknown) {
  if (!params || typeof params !== 'object') return
  syncRoomBriefingFromPerTeamSettings(extractPerTeamSettings(params))
}

function syncRoomSettingsFromOptions(options: unknown) {
  if (!options || typeof options !== 'object') return
  syncRoomBriefingFromPerTeamSettings(extractPerTeamSettings(options))
}

export function setDemoReadonlyMode(enabled: boolean) {
  isDemoReadonlyMode = enabled
}

type SocketLike = {
  readonly readyState: number
  send(data: string): void
  close(): void
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onclose: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
}

type GameSocketErrorKind = 'parse' | 'close' | 'error'

export type GameSocketErrorContext = {
  kind: GameSocketErrorKind
  message: string
  error?: unknown
  shouldReload?: boolean
}

export type GameSocketRuntimeOptions = {
  socketUrl?: string
  onError?: (context: GameSocketErrorContext) => void
  webSocketFactory?: (url: string) => SocketLike
  syncStrategy?: 'auto' | 'raf' | 'interval'
  syncIntervalMs?: number
}

function resolveWindowEnvValue(key: string): string | undefined {
  const value = window.env?.[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function resolveSocketUrl(explicit?: string): string {
  if (explicit && explicit.trim()) return explicit.trim()
  const fromWindow = resolveWindowEnvValue('VITE_SOCKET_URL')
  if (fromWindow) return fromWindow
  const fromImportMeta = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_SOCKET_URL
  if (fromImportMeta && fromImportMeta.trim()) return fromImportMeta.trim()
  throw new Error('[WS] socket url is not configured (VITE_SOCKET_URL)')
}

type SyncLoop = {
  stop(): void
}

function createSyncLoop(
  strategy: 'auto' | 'raf' | 'interval',
  intervalMs: number,
  fn: () => void
): SyncLoop {
  const hasRaf = typeof requestAnimationFrame === 'function'
  const useRaf = strategy === 'raf' || (strategy === 'auto' && hasRaf)

  if (useRaf) {
    const rafInterval = createRafInterval(intervalMs, fn)
    rafInterval.start()
    return {
      stop() {
        rafInterval.stop()
      },
    }
  }

  const intervalId = window.setInterval(fn, intervalMs)
  return {
    stop() {
      window.clearInterval(intervalId)
    },
  }
}

export class GameSocket {
  private ws!: SocketLike
  private world!: world
  private apiEventsListenerUnsub?: unsub
  private forceApiEventsListenerUnsub?: unsub
  private readonly runtimeOptions: GameSocketRuntimeOptions

  constructor(runtimeOptions: GameSocketRuntimeOptions = {}) {
    this.runtimeOptions = runtimeOptions
  }

  connect(params: {
    roomId: string
    team: string
    userId?: number | null
    key?: string
    token?: string
    world: world
    socketUrl?: string
    onError?: (context: GameSocketErrorContext) => void
  }) {
    this.disconnect()
    const query = new URLSearchParams({
      room_id: params.roomId,
      team: params.team,
      user_id: params.userId != null ? String(params.userId) : '',
      key: params.key ?? '',
      token: params.token ?? '',
    })

    this.world = params.world
    const socketUrl = resolveSocketUrl(params.socketUrl || this.runtimeOptions.socketUrl)
    const createSocket = this.runtimeOptions.webSocketFactory || ((url: string) => new WebSocket(url) as unknown as SocketLike)
    this.ws = createSocket(socketUrl + `?${query}`)

    this.ws.onopen = () => {
      this.startSync()
    }

    this.ws.onmessage = (e) => {
      try {
        const msg: InMessage = JSON.parse(e.data)
        this.handleMessage(msg)
      } catch (err) {
        console.error('[WS] invalid message', e.data, err)
        this.handleSocketError({
          kind: 'parse',
          message: 'SOCKET ERROR PARSE MESSAGE',
          error: err,
        }, params.onError)
      }
    }

    this.ws.onclose = () => {
      this.stopSync()
      this.handleSocketError({
        kind: 'close',
        message: 'Socket closed.\nPage will restarted.',
        shouldReload: true,
      }, params.onError)
    }

    this.ws.onerror = (e) => {
      console.error('[WS] error', e)
      this.handleSocketError({
        kind: 'error',
        message: 'Socket error.\nProbably you need to restart page and check last changes.',
        error: e,
      }, params.onError)
    }
  }

  private handleSocketError(context: GameSocketErrorContext, localOnError?: (context: GameSocketErrorContext) => void) {
    if (localOnError) {
      localOnError(context)
      return
    }
    if (this.runtimeOptions.onError) {
      this.runtimeOptions.onError(context)
      return
    }
    window.alert(context.message)
    if (context.shouldReload) {
      window.location.reload()
    }
  }

  /* ================== OUT ================== */
  private syncTimer?: SyncLoop

  private sendBatched(messages: OutMessage[], batchSize = 100) {
    if (this.ws.readyState !== WebSocket.OPEN) return

    for (let i = 0; i < messages.length; i += batchSize) {
      const chunk = messages.slice(i, i + batchSize)
      this.ws.send(
        JSON.stringify({
          messages: chunk,
        })
      )
    }
  }

  private busMessages: OutMessage[] = []
  private startSync() {
    this.apiEventsListenerUnsub = window.ROOM_WORLD.events.on('api', (message) => {
      this.busMessages.push(message);
    })
    this.forceApiEventsListenerUnsub = window.ROOM_WORLD.events.on('force_api', () => {
      this.sync();
    })

    this.syncTimer = createSyncLoop(
      this.runtimeOptions.syncStrategy || 'auto',
      this.runtimeOptions.syncIntervalMs || 500,
      () => this.sync()
    )
  }

  private sync() {
    const dirtyUnitObjects = this.world.units.getDirty()
    const dirtyUnitRemove = this.world.units.getDirtyRemove()
    const dirtyChatMessages = this.world.messages.getDirty()
    const dirtyPaintStrokes = this.world.paint.getDirty()
    const cursor = this.world.cursor.getMoveFrames();

    let messages: OutMessage[] = [
      ...dirtyUnitObjects.map<OutMessage>(u => ({
        type: 'unit',
        data: u.unit,
        frames: u.frames,
      })),
      ...dirtyChatMessages.map<OutMessage>(m => ({
        type: 'chat',
        data: m,
      })),
      ...dirtyPaintStrokes.map<OutMessage>(s => ({
        type: 'paint_add',
        data: s,
      })),
    ];

    if (cursor) {
      messages.push({
        type: 'cursor',
        data: cursor,
      });
    }
    if (dirtyUnitRemove.length) {
      messages.push({
        type: 'unit-remove',
        data: dirtyUnitRemove,
      });
    }

    messages = [
      ...messages,
      ...this.busMessages,
    ];
    this.busMessages = [];

    if (messages.length) {
      this.sendBatched(messages)
    }
  }

  private stopSync() {
    if (this.apiEventsListenerUnsub) {
      this.apiEventsListenerUnsub();
      this.apiEventsListenerUnsub = undefined
    }
    if (this.forceApiEventsListenerUnsub) {
      this.forceApiEventsListenerUnsub();
      this.forceApiEventsListenerUnsub = undefined
    }
    if (this.syncTimer) {
      this.syncTimer.stop();
      this.syncTimer = undefined
    }
  }

  private send(messages: OutMessage[]) {
    if (this.ws.readyState !== WebSocket.OPEN) return

    this.ws.send(
      JSON.stringify({
        messages,
      })
    )
  }

  /* ================== IN ================== */

  private handleMessage(msg: InMessage) {
    if (msg.type === 'messages') {
      let skipTimeSoundPlayed = false
      let lastLiveSkipTimeIndex = -1
      for (let i = msg.messages.length - 1; i >= 0; i -= 1) {
        const message = msg.messages[i]
        if (message?.type === 'skip_time' && message.live === true) {
          lastLiveSkipTimeIndex = i
          break
        }
      }
      for (let messageIndex = 0; messageIndex < msg.messages.length; messageIndex += 1) {
        const m = msg.messages[messageIndex]!
        if (isDemoReadonlyMode && DEMO_BLOCKED_INCOMING_TYPES.has(m.type)) {
          continue
        }

        if (m.type === 'unit') {
          const mData = {...m.data};
          if (m.frames && m.frames.length) {
            const unit = this.world.units.get(mData.id);
            if (unit) {
              mData.pos = unit.pos;
            }
          }

          this.world.units.upsert(mData, 'remote');


          if (m.frames && m.frames.length) {
            this.world.units.get(mData.id)!.applyRemoteFrames(m.frames);
          }
        } else if (m.type === 'unit-remove') {
          for (const unitId of m.data) {
            this.world.units.remove(unitId, 'remote');
          }
        } else if (m.type === 'chat') {
          this.world.messages.upsert(m.data, 'remote', m.meta && m.meta.ignore);
          for (const unitId of m.data.unitIds) {
            const u = this.world.units.get(unitId)
            if (u) {
              u.linkMessage(m.data.id)
            }
          }
        } else if (m.type === 'chat_orders_update') {
          const chat = this.world.messages.get(m.data.id)
          if (!chat) continue
          chat.orders = m.data.orders ?? null
        } else if (m.type === 'chat_read') {
          for (const id of m.data) {
            const message = this.world.messages.get(id);
            if (message) {
              message.status = ChatMessageStatus.Read;
            }
          }
        } else if (m.type === 'cursor') {
          this.world.cursor.upsertRemoteCursor(m.data);
        } else if (m.type === 'skip_time') {
          if (
            m.live === true
            && lastLiveSkipTimeIndex >= 0
            && messageIndex !== lastLiveSkipTimeIndex
          ) {
            continue
          }
          const played = this.world.updateTime(m.data, {
            live: m.live === true,
            liveIntervalMs: m.liveIntervalMs,
            liveGameSecondsPerMinute: m.liveGameSecondsPerMinute,
            allowSound: !skipTimeSoundPlayed,
          });
          if (played) {
            skipTimeSoundPlayed = true
          }
        } else if (m.type === 'room') {
          this.world.time = m.data.ingame_time;
          this.world.stage = m.data.stage;
          this.world.weather.value = m.data.weather;
          this.world.newWeather.value = m.data.weather;
          if (m.data.options && typeof m.data.options === 'object') {
            Object.assign(window.ROOM_SETTINGS, m.data.options)
            syncRoomSettingsFromOptions(m.data.options)
          }
          applyRoomParams(m.data.params)
          syncRoomSettingsFromParams(m.data.params)
        } else if (m.type === 'room_params_update') {
          applyRoomParams(m.data)
          syncRoomSettingsFromParams(m.data)
        } else if (m.type === 'room_per_team_settings_update') {
          syncRoomBriefingFromPerTeamSettings(m.data as Record<string, Record<string, unknown>>)
          window.ROOM_PARAMS ??= {}
          window.ROOM_PARAMS.perTeamSettings = {
            ...(window.ROOM_PARAMS.perTeamSettings || {}),
            ...(m.data || {}),
          }
        } else if (m.type === 'set_stage') {
          if (this.world.stage === RoomGameStage.PLANNING) {
            this.world.stage = m.data;
          }
        } else if (m.type === 'direct_view') {
          for (const u of window.ROOM_WORLD.units.list()) {
            if (u.directView) {
              if (
                u.team !== window.PLAYER.team && window.PLAYER.team !== Team.ADMIN
                || u.type === unitType.MESSENGER && window.PLAYER.team !== Team.ADMIN
              ) {
                window.ROOM_WORLD.units.remove(u.id)
              } else {
                clearUnitCommandsForDirectView(u)
                u.directView = false;
              }
            }
          }

          for (const packet of m.data) {
            const nextUnitState = {...packet.unit}
            const u = window.ROOM_WORLD.units.get(nextUnitState.id);
            if (packet.frames && packet.frames.length > 0) {
              nextUnitState.pos = u?.pos ?? packet.frames[0]!.pos
            }
            if (!u) {
              nextUnitState.directView = true
              window.ROOM_WORLD.units.upsert(nextUnitState, 'remote');
            } else {
              const nextFuturePos = getFuturePosFromMoveCommands(nextUnitState.commands)
              // Update only some fields
              Object.assign(u, nextUnitState)
              u.futurePos = nextFuturePos
              u.directView = true;
            }
            if (packet.frames && packet.frames.length > 0) {
              const targetUnit = window.ROOM_WORLD.units.get(nextUnitState.id)
              targetUnit?.applyRemoteFrames(packet.frames)
            }
          }
        } else if (m.type === 'direct_view_objects') {
          this.world.setDirectViewObjects(m.data)
        } else if (m.type === 'direct_view_send_order') {
          const unitId = (m.data?.unitId ?? '').toString()
          if (!unitId) continue
          const unit = this.world.units.get(unitId)
          if (!unit) continue

          const incomingCommands = Array.isArray(m.data?.commands)
            ? m.data.commands
            : []
          const nonMoveCommands = unit
            .getCommands()
            .filter((cmd) => cmd.type !== 'move')
          const moveCommands = incomingCommands
            .filter((cmd): cmd is commandstate => cmd?.type === 'move')
            .map((cmd) => createUnitCommand(cmd))
          unit.manualEnvironment = null
          unit.setCommands([...nonMoveCommands, ...moveCommands])
        } else if (m.type === 'weather') {
          window.ROOM_WORLD.weather.value = m.data
          window.ROOM_WORLD.newWeather.value = m.data
        } else if (m.type === 'log') {
          window.ROOM_WORLD.logs.value.push(m.data)
        } else if (m.type === 'connection_new') {
          const idx = this.world.connections.value.findIndex(c => c.id === m.data.id);
          if (idx >= 0) {
            this.world.connections.value[idx] = {
              ...this.world.connections.value[idx],
              ...m.data,
            }
          } else {
            this.world.connections.value.push(m.data)
          }
          if (
            m.data.user_id
            && (m.data.team === Team.RED || m.data.team === Team.BLUE)
            && typeof m.data.is_ready === 'boolean'
          ) {
            this.world.upsertPlayerReadyState({
              user_id: m.data.user_id,
              user: m.data.user,
              team: m.data.team,
              is_ready: m.data.is_ready,
            })
          }
        } else if (m.type === 'connection_close') {
          this.world.connections.value = this.world.connections.value.filter(c => c.id !== m.data.id);
        } else if (m.type === 'room_user_ready') {
          const readyData = m.data
          if ('user_id' in readyData) {
            this.world.upsertPlayerReadyState({
              user_id: readyData.user_id,
              user: readyData.user,
              team: readyData.team,
              is_ready: readyData.is_ready,
            })
            this.world.connections.value = this.world.connections.value.map((connection) => {
              if (
                connection.team === readyData.team
                && connection.user_id === readyData.user_id
              ) {
                return {
                  ...connection,
                  is_ready: readyData.is_ready,
                }
              }
              return connection
            })
          }
        } else if (m.type === 'paint_add') {
          this.world.addPaintStroke(m.data, 'remote')
        } else if (m.type === 'paint_undo') {
          this.world.removePaintStrokeById(m.data.id)
        } else if (m.type === 'skip_time_success') {
          this.world.events.emit('changed', {reason: 'skip_time_success'})
        }
      }

      this.world.events.emit('changed', { reason: 'ws' })
    }

    if (msg.type === 'error') {
      console.error('[WS error]', msg.message)
    }
  }

  disconnect() {
    this.stopSync()
    this.ws?.close()
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
