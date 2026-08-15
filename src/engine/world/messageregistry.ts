import {type ChatMessage, ChatMessageStatus} from "@/engine/types/chatMessage.ts";
import type {uuid} from "@/engine";
import {RoomGameStage} from "@/enums/roomStage.ts";

function isOpenDeliveryStatus(
  status: ChatMessage["deliveryStatus"],
): boolean {
  return status == null || status === 'pending' || status === 'in_transit'
}

export class messageregistry {
  private map = new Map<uuid, ChatMessage>()
  private dirty = new Set<uuid>()
  private newMessages = new Set<uuid>();
  private messengerSpawnCandidates = new Set<uuid>();
  private remoteMessagesSeen = new Set<uuid>();

  upsert(item: ChatMessage, source: 'local' | 'remote' = 'local', ignoreNew: boolean = false): ChatMessage {
    if (source === 'remote' && !this.remoteMessagesSeen.has(item.id)) {
      this.remoteMessagesSeen.add(item.id)
      if (window.ROOM_WORLD?.stage === RoomGameStage.WAR) {
        this.messengerSpawnCandidates.add(item.id)
      }
    }

    const existing = this.map.get(item.id)
    if (existing) {
      const next: ChatMessage = { ...item }
      if ((next.author_avatar == null || next.author_avatar === '') && existing.author_avatar) {
        next.author_avatar = existing.author_avatar
      }
      if (next.author_id == null && existing.author_id != null) {
        next.author_id = existing.author_id
      }
      const alreadyDelivered = existing.delivered || existing.deliveryStatus === 'delivered'
      if (alreadyDelivered && isOpenDeliveryStatus(next.deliveryStatus) && next.delivered !== true) {
        next.delivered = true
        next.deliveryStatus = 'delivered'
        next.delivered_at = existing.delivered_at ?? next.delivered_at
      }
      Object.assign(existing, next)
      return existing
    }

    if (source == 'local') {
      this.dirty.add(item.id)
    } else {
      if (!ignoreNew && !this.map.has(item.id)) {
        this.newMessages.add(item.id);
      }
    }
    this.map.set(item.id, item)
    return item
  }

  get(id: uuid): ChatMessage | null {
    return this.map.get(id) ?? null
  }

  setOrders(id: uuid, orders: ChatMessage["orders"] | null | undefined): ChatMessage | null {
    const message = this.map.get(id)
    if (!message) return null
    message.orders = orders ?? null
    return message
  }

  list(): ChatMessage[] {
    return [...this.map.values()]
  }

  getDirty(): ChatMessage[] {
    const list: ChatMessage[] = []
    for (const id of this.dirty) {
      const item = this.map.get(id);
      if (item) {
        list.push(item);
      }
    }
    this.dirty.clear();

    return list;
  }

  markAsRead(id: uuid) {
    const message = this.get(id);
    if (message) {
      message.status = ChatMessageStatus.Read;
      window.ROOM_WORLD.events.emit('api', { type: 'chat_read', data: [id]});
    }
  }

  getNew(): ChatMessage[] {
    const list: ChatMessage[] = []
    for (const id of this.newMessages) {
      const item = this.map.get(id);
      if (item) {
        list.push(item);
      }
    }
    this.newMessages.clear();

    return list;
  }

  getMessengerSpawnCandidates(): ChatMessage[] {
    const list: ChatMessage[] = []
    for (const id of this.messengerSpawnCandidates) {
      const item = this.map.get(id)
      if (item) {
        list.push(item)
      }
    }
    this.messengerSpawnCandidates.clear()

    return list
  }

  forgetMessengerSpawnCandidates(ids?: uuid[]): void {
    if (!ids) {
      this.messengerSpawnCandidates.clear()
      return
    }
    for (const id of ids) {
      this.messengerSpawnCandidates.delete(id)
    }
  }
}
