import {type ChatMessage, ChatMessageStatus} from "@/engine/types/chatMessage.ts";
import type {uuid} from "@/engine";


export class messageregistry {
  private map = new Map<uuid, ChatMessage>()
  private dirty = new Set<uuid>()
  private newMessages = new Set<uuid>();

  upsert(item: ChatMessage, source: 'local' | 'remote' = 'local', ignoreNew: boolean = false): ChatMessage {
    const existing = this.map.get(item.id)
    if (existing) {
      const next: ChatMessage = { ...item }
      if ((next.author_avatar == null || next.author_avatar === '') && existing.author_avatar) {
        next.author_avatar = existing.author_avatar
      }
      if (next.author_id == null && existing.author_id != null) {
        next.author_id = existing.author_id
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
}
