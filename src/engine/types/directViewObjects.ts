import type { vec2 } from '@/engine/types.ts'
import type { unitTeam } from '@/engine/units/types.ts'

export type DirectViewObjectType = 'inaccuracy'

export type DirectViewInaccuracyObject = {
  type: 'inaccuracy'
  team: unitTeam
  seenRoomUserIds?: number[]
  data: {
    point: vec2
    radiusMeters: number
  }
}

export type DirectViewObjectState = DirectViewInaccuracyObject
