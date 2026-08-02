import type {Team} from "@/enums/teamKeys.ts";
import type {uuid} from "@/engine";
import type {UnitOrderState} from "@/engine/units/orderStateNotes.ts";

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
    // Who authored the commands. Absent on everything written before this
    // field existed, which is treated as 'umpire'.
    origin?: 'author' | 'umpire'
    generatedAt: string
    summary?: string
    unresolvedLocations?: string[]
    hintPositions?: Array<{
      name: string
      description: string
      x: number
      y: number
    }>
    perUnit: Array<{
      unitId: uuid
      unitLabel?: string
      commands: unknown[]
      notes?: string[]
      // On-unit state the order sets: auto-attack, scheduled triggers. The
      // structured form of what notes carried as prefixed strings.
      state?: UnitOrderState
    }>
    rawPlan?: unknown
  } | null
  /**
   * What the reporting units could see when the message was written.
   *
   * Written beside the prose, never instead of it, and only where the reading
   * side is an automated client: a person reads the report, a program cannot
   * be asked to read around a sentence. Everything here is stated in the same
   * global map coordinates as the rest of the game, and it describes `time`
   * rather than the moment of delivery.
   */
  observation?: ChatMessageObservation | null
  team: Team
  status: ChatMessageStatus
  delivered: boolean
}

export type ObservedUnit = {
  unitId: uuid
  team: string
  type: string
  pos: { x: number; y: number }
  /** Absent where the observer is too far to make out a strength. */
  hp?: number
  maxHp?: number
  formation?: string
  envState?: string[]
  /** Which of the reporting units saw it, and from how far. */
  seenBy: Array<{ unitId: uuid; distanceMeters: number }>
}

export type ChatMessageObservation = {
  /** The game time this describes, which is the message's own. */
  at: string
  reporters: Array<{
    unitId: uuid
    type: string
    pos: { x: number; y: number }
    hp: number
    maxHp: number
    fatigue: number
    morale: number
    formation?: string
    envState?: string[]
    isRetreat: boolean
    /** Damage per minute currently being taken, where any is. */
    incoming?: { direct?: number; artillery?: number }
  }>
  /** Everything the reporters could see that is not one of them. */
  seen: ObservedUnit[]
}
