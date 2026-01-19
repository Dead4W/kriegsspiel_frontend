import {type unitstate, unitType, type uuid} from '@/engine/units/types'
import {type MoveFrame, world} from '@/engine'
import {createRafInterval, type RafInterval} from "@/engine/util.ts";
import {type ChatMessage, ChatMessageStatus} from "@/engine/types/chatMessage.ts";
import type {CursorObject} from "@/engine/world/cursorregistry.ts";
import {RoomGameStage} from "@/enums/roomStage.ts";
import {Team} from "@/enums/teamKeys.ts";
import type {unsub} from "@/engine/events.ts";
import type {WeatherEnum} from "@/engine/units/modifiers/UnitWeatherModifiers.ts";

export type OutMessage =
  | { type: 'room'; data: {ingame_time: string, stage: RoomGameStage, weather: WeatherEnum} }
  | { type: 'unit'; data: unitstate; frames?: MoveFrame[] }
  | { type: 'unit-remove'; data: uuid[] }
  | { type: 'paint'; pos_list: number[] }
  | { type: 'chat'; data: ChatMessage; meta?: {ignore?: boolean} }
  | { type: 'chat_read'; data: uuid[] }
  | { type: 'cursor'; data: CursorObject }
  | { type: 'skip_time'; data: string }
  | { type: 'set_stage'; data: RoomGameStage }
  | { type: 'messenger_delivery'; data: {id: uuid, time: string} }
  | { type: 'direct_view'; team: Team; data: unitstate[] }
  | { type: 'weather'; data: WeatherEnum }

export type InMessage =
  | { type: 'messages'; messages: OutMessage[] }
  | { type: 'list_connections'; data: number[] }
  | { type: 'new_connection'; meta: { team: string } }
  | { type: 'error'; message: string }

export class GameSocket {
  private ws!: WebSocket
  private world!: world
  private apiEventsListenerUnsub?: unsub;

  connect(params: {
    roomId: string
    team: string
    key?: string
    world: world
  }) {
    this.disconnect();
    const query = new URLSearchParams({
      room_id: params.roomId,
      team: params.team,
      key: params.key ?? '',
    })

    this.world = params.world
    this.ws = new WebSocket(import.meta.env.VITE_SOCKET_URL + `?${query}`)

    this.ws.onopen = () => {
      console.log('[WS] connected')
      this.startSync()
    }

    this.ws.onmessage = (e) => {
      try {
        const msg: InMessage = JSON.parse(e.data)
        this.handleMessage(msg)
      } catch (err) {
        console.error('[WS] invalid message', e.data, err)
        alert("SOCKET ERROR PARSE MESSAGE");
      }
    }

    this.ws.onclose = () => {
      this.stopSync()
      alert('Socket closed.\nPage will restarted.')
      window.location.reload()
    }

    this.ws.onerror = (e) => {
      alert('Socket error.\nProbably you need to restart page and check last changes.')
      console.error('[WS] error', e)
    }
  }

  /* ================== OUT ================== */
  private syncTimer?: RafInterval

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

  private startSync() {
    let busMessages: OutMessage[] = []
    window.ROOM_WORLD.events.on('api', (message) => {
      busMessages.push(message);
    })

    this.syncTimer = createRafInterval(500, () => {
      if (window.ROOM_WORLD.socketLock) return

      const dirtyUnitObjects = this.world.units.getDirty()
      const dirtyUnitRemove = this.world.units.getDirtyRemove()
      const dirtyChatMessages = this.world.messages.getDirty()
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
        ...busMessages,
      ];
      busMessages = [];

      if (messages.length) {
        this.sendBatched(messages)
      }
    });
    this.syncTimer.start();
  }

  private stopSync() {
    if (this.apiEventsListenerUnsub) {
      this.apiEventsListenerUnsub();
    }
    if (this.syncTimer) {
      this.syncTimer.stop();
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
      for (const m of msg.messages) {
        if (this.world.socketLock) return

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
          this.world.updateTime(m.data);
        } else if (m.type === 'room') {
          this.world.time = m.data.ingame_time;
          this.world.stage = m.data.stage;
          this.world.weather.value = m.data.weather;
          this.world.newWeather.value = m.data.weather;
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
                u.directView = false;
              }
            }
          }

          for (const unitDirectView of m.data) {
            const u = window.ROOM_WORLD.units.get(unitDirectView.id);
            if (!u) {
              unitDirectView.directView = true
              window.ROOM_WORLD.units.upsert(unitDirectView, 'remote');
            } else {
              // Update only some fields
              Object.assign(u, unitDirectView)
              u.directView = true;
            }
          }
        } else if (m.type === 'weather') {
          window.ROOM_WORLD.weather.value = m.data
          window.ROOM_WORLD.newWeather.value = m.data
        }

        // TODO: paint
        // if (m.type === 'paint') {
        //   for (const pos of m.pos_list) {
        //     this.world.overlay.add({
        //       type: 'paint',
        //       pos,
        //     })
        //   }
        // }
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
}
