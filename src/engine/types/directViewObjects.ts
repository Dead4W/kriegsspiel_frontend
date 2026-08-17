import type { vec2 } from '@/engine/types.ts'
import type { unitTeam } from '@/engine/units/types.ts'

export type DirectViewObjectType = 'inaccuracy' | 'attack_line'

export type DirectViewInaccuracyObject = {
  type: 'inaccuracy'
  team: unitTeam
  seenRoomUserIds?: number[]
  data: {
    point: vec2
    radiusMeters: number
  }
}

export type DirectViewAttackLineObject = {
  type: 'attack_line'
  team: unitTeam
  seenRoomUserIds?: number[]
  data: {
    from: vec2
    to: vec2
  }
}

export type DirectViewObjectState = DirectViewInaccuracyObject | DirectViewAttackLineObject
