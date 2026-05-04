import type {Team} from "@/enums/teamKeys.ts";
import type {uuid} from "@/engine";

export enum ChatMessageStatus {
  Sent = "sent",
  Read = "read",
}

export type ChatMessage = {
  id: uuid
  author: string
  author_id?: number
  author_avatar?: string | null
  author_team: Team
  unitIds: uuid[]
  text: string
  time: string
  created_at?: string
  delivered_at?: string | null
  unitFallbackTitles?: Record<uuid, string>
  team: Team
  status: ChatMessageStatus
  delivered: boolean
}
