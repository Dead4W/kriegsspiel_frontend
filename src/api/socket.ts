import type {unitstate, unitTeam, uuid} from '@/engine/units/types'
import {type MoveFrame, type vec2, world} from '@/engine'
import {createRafInterval, type RafInterval} from "@/engine/util.ts";
import {type ChatMessage, ChatMessageStatus} from "@/engine/types/chatMessage.ts";
import type {CursorObject} from "@/engine/world/cursorregistry.ts";
import {RoomGameStage} from "@/enums/roomStage.ts";
import type {Team} from "@/enums/teamKeys.ts";

export type OutMessage =
  | { type: 'room'; data: {ingame_time: string, stage: RoomGameStage} }
  | { type: 'unit'; data: unitstate; frames: MoveFrame[] }
  | { type: 'unit-remove'; data: uuid[] }
  | { type: 'paint'; pos_list: number[] }
  | { type: 'chat'; data: ChatMessage; meta?: {ignore?: boolean} }
  | { type: 'chat_read'; data: uuid[] }
  | { type: 'cursor'; data: CursorObject }
  | { type: 'skip_time'; data: string }
  | { type: 'set_stage'; data: RoomGameStage }
  | { type: 'copy_board'; data: Team }
  | { type: 'messenger_delivery'; data: {id: uuid, time: string} }
  | { type: 'direct_view'; team: Team; data: {id: uuid, pos: vec2, hp: number}[] }

export type InMessage =
  | { type: 'messages'; messages: OutMessage[] }
  | { type: 'list_connections'; data: number[] }
  | { type: 'new_connection'; meta: { team: string } }
  | { type: 'error'; message: string }

export class GameSocket {
  private ws!: WebSocket
  private world!: world
  private intervalId?: number

  connect(params: {
    roomId: string
    team: string
    password?: string
    key?: string
    world: world
  }) {
    const query = new URLSearchParams({
      room_id: params.roomId,
      team: params.team,
      password: params.password ?? '',
      key: params.key ?? '',
    })

    this.world = params.world
    this.ws = new WebSocket(import.meta.env.VITE_SOCKET_URL + `?${query}`)

    this.ws.onopen = () => {
      console.log('[WS] connected')
      this.startSync()
    }

    this.ws.onmessage = (e) => {
      const msg: InMessage = JSON.parse(e.data)
      this.handleMessage(msg)
    }

    this.ws.onclose = () => {
      console.log('[WS] closed')
      this.stopSync()
    }

    this.ws.onerror = (e) => {
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
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
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
          let unitPos = m.data.pos;
          if (m.frames && m.frames.length) {
            const unit = this.world.units.get(m.data.id);
            if (unit) {
              m.data.pos = unit.pos;
            }
          }

          this.world.units.upsert(m.data, 'remote');


          if (m.frames && m.frames.length) {
            this.world.units.get(m.data.id)!.applyRemoteFrames(m.frames);
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
        } else if (m.type === 'set_stage') {
          if (this.world.stage === RoomGameStage.PLANNING) {
            this.world.stage = m.data;
          }
        } else if (m.type === 'direct_view') {
          for (const u of window.ROOM_WORLD.units.list()) {
            u.directView = false;
          }

          for (const {id: unitId, pos: unitPos, hp: unitHp} of m.data) {
            const u = window.ROOM_WORLD.units.get(unitId)!;
            if (!u) continue;
            u.pos = unitPos;
            u.hp = unitHp;
            u.directView = true;
          }
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
