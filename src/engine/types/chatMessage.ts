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
  quotedMessageId?: uuid | null
  messengerId?: uuid | null
  deliveryStatus?: 'pending' | 'in_transit' | 'delivered' | 'failed' | 'intercepted'
  routePoints?: Array<{ x: number; y: number }>
  unitFallbackTitles?: Record<uuid, string>
  orders?: {
    status: 'pending' | 'ready' | 'needs_clarification' | 'error'
    generatedAt: string
    summary?: string
    unresolvedLocations?: string[]
    perUnit: Array<{
      unitId: uuid
      unitLabel?: string
      commands: unknown[]
      notes?: string[]
    }>
    rawPlan?: unknown
  } | null
  team: Team
  status: ChatMessageStatus
  delivered: boolean
}
