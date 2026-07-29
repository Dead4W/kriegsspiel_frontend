import type { VisionOccluderField } from './visionRaycastCore.ts'

export type VisionRaycastJob = {
  unitId: string
  // Монотонный номер запроса. Ответ с устаревшим token'ом выбрасывается: юнит
  // успел сдвинуться, и для него уже отправлен новый запрос.
  token: number
  originX: number
  originY: number
  maxRange: number
  unitInsideHouse: boolean
}

export type VisionRaycastWorkerRequest =
  | { type: 'field'; field: VisionOccluderField }
  | { type: 'cast'; jobs: VisionRaycastJob[] }

export type VisionRaycastWorkerResponse =
  | { type: 'ready' }
  | { type: 'polygon'; unitId: string; token: number; points: Float32Array }
