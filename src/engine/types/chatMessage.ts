import type {Team} from "@/enums/teamKeys.ts";
import type {uuid} from "@/engine";

export enum ChatMessageStatus {
  Sent = "sent",
  Read = "read",
}

export type ChatMessage = {
  id: uuid
  author: string
  author_team: Team
  unitIds: uuid[]
  text: string
  time: string
  team: Team
  status: ChatMessageStatus
  delivered: boolean
}
