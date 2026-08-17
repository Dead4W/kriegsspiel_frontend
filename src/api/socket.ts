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
import {
  getPaintPlaybackTime,
  isHistoricalPaintStroke,
  resolvePaintTimelineStart,
} from "@/engine/world/paintPlayback.ts";

export type DirectViewUnitPacket = {
  unit: unitstate
  frames?: MoveFrame[]
}

export type EndResults = {
  blueWin?: number
  redWin?: number
  blueResult?: Record<string, string>
  redResult?: Record<string, string>
}

export type OutMessage =
  | { type: 'room'; data: {ingame_time: string, stage: RoomGameStage, weather: Weather, options?: Record<string, unknown>, params?: Record<string, unknown>} & EndResults }
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
  | { type: 'set_stage'; data: RoomGameStage | ({ stage: RoomGameStage } & EndResults) }
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
  | { type: 'room_options_update'; data: Record<string, unknown> }
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

function applyRoomParams(params: unknown) {
  if (!params || typeof params !== 'object') return
  window.ROOM_PARAMS ??= {}
  Object.assign(window.ROOM_PARAMS, params as Record<string, unknown>)
}

function applyEndResults(results: EndResults) {
  const values = Object.fromEntries(
    Object.entries(results).filter(([, value]) => value !== undefined)
  )
  if (!Object.keys(values).length) return
  window.ROOM_PARAMS ??= {}
  Object.assign(window.ROOM_PARAMS, values)
  window.ROOM_SETTINGS ??= {}
  Object.assign(window.ROOM_SETTINGS, values)
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

function shouldDeferUnitMessageLink(message: ChatMessage, stage: RoomGameStage): boolean {
  if (stage !== RoomGameStage.WAR) return false
  if (message.delivered) return false
  return message.deliveryStatus === 'pending' || message.deliveryStatus === 'in_transit'
}

function applyMessengerDeliveryUpdate(
  message: ChatMessage,
  payload: {
    time: string
    messengerId?: uuid
    quotedMessageId?: uuid | null
    deliveryStatus?: 'pending' | 'in_transit' | 'delivered' | 'failed' | 'intercepted'
  }
) {
  if (payload.messengerId) {
    message.messengerId = payload.messengerId
  }
  if (payload.quotedMessageId !== undefined) {
    message.quotedMessageId = payload.quotedMessageId
  }
  if (payload.deliveryStatus) {
    message.deliveryStatus = payload.deliveryStatus
  }
  if (message.deliveryStatus === 'delivered') {
    message.delivered = true
    message.delivered_at = payload.time
  } else if (message.deliveryStatus === 'failed' || message.deliveryStatus === 'intercepted') {
    message.delivered = false
  }
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
  private paintAnimationFrames = new Set<number>()
  private isInitialStateSync = true

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
    this.isInitialStateSync = true
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

  private sendBatched(messages: OutMessage[], batchSize = 10000) {
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

  private addAnimatedPaintStroke(
    stroke: PaintStroke,
    timelineStart: number,
    playbackStartedAt: number,
  ) {
    const targetPoints = stroke.points.slice()
    const pointCount = targetPoints.length >> 1
    const pointTimes = stroke.pointTimes?.slice()
    const hasValidTimeline =
      pointTimes?.length === pointCount
      && pointTimes.every((time, index) =>
        Number.isFinite(time) && (index === 0 || time >= pointTimes[index - 1]!)
      )
    if (pointCount < 2 || !hasValidTimeline || isHistoricalPaintStroke(pointTimes, Date.now())) {
      this.world.addPaintStroke(stroke, 'remote')
      return
    }

    const animatedStroke: PaintStroke = {
      ...stroke,
      points: targetPoints.slice(0, 2),
    }
    this.world.addPaintStroke(animatedStroke, 'remote')

    let animationFrame = 0
    const tick = (now: number) => {
      this.paintAnimationFrames.delete(animationFrame)
      const playbackTime = getPaintPlaybackTime(timelineStart, playbackStartedAt, now)

      if (playbackTime >= pointTimes[pointCount - 1]!) {
        animatedStroke.points = targetPoints
        this.world.touchPaint()
        return
      }

      const visiblePoints = targetPoints.slice(0, 2)
      let nextPoint = 1
      while (nextPoint < pointCount && pointTimes[nextPoint]! <= playbackTime) {
        const offset = nextPoint << 1
        visiblePoints.push(targetPoints[offset]!, targetPoints[offset + 1]!)
        nextPoint++
      }

      if (nextPoint < pointCount && playbackTime >= pointTimes[0]!) {
        const previousPoint = nextPoint - 1
        const previousOffset = previousPoint << 1
        const nextOffset = nextPoint << 1
        const segmentDuration = pointTimes[nextPoint]! - pointTimes[previousPoint]!
        const segmentProgress = segmentDuration > 0
          ? (playbackTime - pointTimes[previousPoint]!) / segmentDuration
          : 1
        visiblePoints.push(
          targetPoints[previousOffset]! + (targetPoints[nextOffset]! - targetPoints[previousOffset]!) * segmentProgress,
          targetPoints[previousOffset + 1]! + (targetPoints[nextOffset + 1]! - targetPoints[previousOffset + 1]!) * segmentProgress,
        )
      }

      animatedStroke.points = visiblePoints
      this.world.touchPaint()
      animationFrame = requestAnimationFrame(tick)
      this.paintAnimationFrames.add(animationFrame)
    }

    animationFrame = requestAnimationFrame(tick)
    this.paintAnimationFrames.add(animationFrame)
  }

  private handleMessage(msg: InMessage) {
    if (msg.type === 'messages') {
      let skipTimeSoundPlayed = false
      let lastLiveSkipTimeIndex = -1
      const animatedUnitIds = new Set<string>()
      const paintPlaybackStartedAt = performance.now()
      const paintTimelineStart = resolvePaintTimelineStart(
        msg.messages.flatMap((message) => message.type === 'paint_add' ? [message.data] : []),
        Date.now(),
      )
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

        // Announced before the packet is applied, while the state it is about
        // to overwrite is still readable.
        void this.world.events.emit('received', m)

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
            const unit = this.world.units.get(mData.id)!
            if (animatedUnitIds.has(mData.id)) {
              unit.appendRemoteFrames(m.frames)
            } else {
              unit.applyRemoteFrames(m.frames)
              animatedUnitIds.add(mData.id)
            }
          }
        } else if (m.type === 'unit-remove') {
          for (const unitId of m.data) {
            this.world.units.remove(unitId, 'remote');
          }
        } else if (m.type === 'chat') {
          const ignoreNewMessage = m.meta?.ignore === true && window.PLAYER.team !== Team.SPECTATOR
          this.world.messages.upsert(m.data, 'remote', ignoreNewMessage);
          if (!shouldDeferUnitMessageLink(m.data, this.world.stage)) {
            for (const unitId of m.data.unitIds) {
              const u = this.world.units.get(unitId)
              if (u) {
                u.linkMessage(m.data.id)
              }
            }
          }
        } else if (m.type === 'chat_edit') {
          const message = this.world.messages.get(m.data.id)
          if (message) {
            message.text = m.data.text
          }
        } else if (m.type === 'chat_orders_update') {
          const chat = this.world.messages.setOrders(m.data.id, m.data.orders ?? null)
          if (!chat) continue
        } else if (m.type === 'messenger_delivery' || m.type === 'messenger_delivery_update') {
          const message = this.world.messages.get(m.data.id)
          if (!message) continue
          applyMessengerDeliveryUpdate(message, m.data)
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
          applyEndResults(m.data)
        } else if (m.type === 'room_params_update') {
          applyRoomParams(m.data)
          syncRoomSettingsFromParams(m.data)
        } else if (m.type === 'room_options_update') {
          Object.assign(window.ROOM_SETTINGS, m.data)
          syncRoomSettingsFromOptions(m.data)
        } else if (m.type === 'room_per_team_settings_update') {
          syncRoomBriefingFromPerTeamSettings(m.data as Record<string, Record<string, unknown>>)
          window.ROOM_PARAMS ??= {}
          window.ROOM_PARAMS.perTeamSettings = {
            ...(window.ROOM_PARAMS.perTeamSettings || {}),
            ...(m.data || {}),
          }
        } else if (m.type === 'set_stage') {
          const stage = typeof m.data === 'string' ? m.data : m.data.stage
          if (
            (this.world.stage === RoomGameStage.PLANNING && stage === RoomGameStage.WAR)
            || (this.world.stage === RoomGameStage.WAR && stage === RoomGameStage.END)
          ) {
            this.world.stage = stage
            if (typeof m.data === 'object') {
              applyEndResults(m.data)
            }
          }
        } else if (m.type === 'direct_view') {
          if (window.PLAYER.team === Team.ADMIN || window.PLAYER.team === Team.SPECTATOR) {
            continue;
          }

          const visibleDirectViewIds = new Set<string>()
          for (const packet of m.data) {
            const nextUnitState = {...packet.unit}
            const u = window.ROOM_WORLD.units.get(nextUnitState.id);
            if (packet.frames && packet.frames.length > 0) {
              nextUnitState.pos = u?.pos ?? packet.frames[0]!.pos
            }
            nextUnitState.directView = true
            // Use the regular ingestion path for both new and existing units so
            // command-derived render state (such as futurePos) stays in sync.
            window.ROOM_WORLD.units.upsert(nextUnitState, 'remote')
            visibleDirectViewIds.add(nextUnitState.id)
            if (packet.frames && packet.frames.length > 0) {
              const targetUnit = window.ROOM_WORLD.units.get(nextUnitState.id)
              if (targetUnit) {
                if (animatedUnitIds.has(nextUnitState.id)) {
                  targetUnit.appendRemoteFrames(packet.frames)
                } else {
                  targetUnit.applyRemoteFrames(packet.frames)
                  animatedUnitIds.add(nextUnitState.id)
                }
              }
            }
          }
          for (const unit of window.ROOM_WORLD.units.list()) {
            if (visibleDirectViewIds.has(unit.id)) continue
            unit.hpLost5min = 0
          }
        } else if (m.type === 'direct_view_objects') {
          if (window.PLAYER.team === Team.ADMIN || window.PLAYER.team === Team.SPECTATOR) {
            continue;
          }

          this.world.setDirectViewObjects(m.data)
        } else if (m.type === 'direct_view_send_order') {
          const unitId = (m.data?.unitId ?? '').toString()
          if (!unitId) continue
          const unit = this.world.units.get(unitId)
          if (!unit) continue
          if (unit.type === unitType.MESSENGER) continue

          const incomingCommands = Array.isArray(m.data?.commands)
            ? m.data.commands
            : []
          const directViewManagedTypes = new Set(['move', 'attack'])
          const incomingCommandTypes = new Set(
            incomingCommands
              .map((cmd) => (cmd as { type?: unknown })?.type)
              .filter((type): type is string => (
                typeof type === 'string'
                && directViewManagedTypes.has(type)
              ))
          )
          const preservedCommands = unit
            .getCommands()
            .filter((cmd) => {
              // Empty direct-view payload means "clear player orders".
              if (!incomingCommandTypes.size) {
                return !directViewManagedTypes.has(cmd.type)
              }
              return !incomingCommandTypes.has(cmd.type)
            })
          const nextIncomingCommands = incomingCommands
            .filter((cmd): cmd is commandstate => {
              const type = (cmd as { type?: unknown })?.type
              return type === 'move' || type === 'attack'
            })
            .map((cmd) => createUnitCommand(cmd))
          unit.manualEnvironment = null
          unit.setCommands([...preservedCommands, ...nextIncomingCommands])
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
          if (this.isInitialStateSync) {
            this.world.addPaintStroke(m.data, 'remote')
          } else {
            this.addAnimatedPaintStroke(m.data, paintTimelineStart, paintPlaybackStartedAt)
          }
        } else if (m.type === 'paint_undo') {
          this.world.removePaintStrokeById(m.data.id)
        } else if (m.type === 'skip_time_success') {
          this.world.events.emit('changed', {reason: 'skip_time_success'})
        }
      }

      this.world.events.emit('changed', { reason: 'ws' })
      this.isInitialStateSync = false
    }

    if (msg.type === 'error') {
      console.error('[WS error]', msg.message)
    }
  }

  disconnect() {
    for (const frame of this.paintAnimationFrames) cancelAnimationFrame(frame)
    this.paintAnimationFrames.clear()
    this.stopSync()
    this.ws?.close()
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
