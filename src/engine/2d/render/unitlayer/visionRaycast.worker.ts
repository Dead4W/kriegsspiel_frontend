import {
  buildVisionPolygonPoints,
  createOccluderSampler,
  type OccluderSampler,
  type VisionOccluderField,
} from './visionRaycastCore.ts'
import type {
  VisionRaycastWorkerRequest,
  VisionRaycastWorkerResponse,
} from './visionRaycastProtocol.ts'

// tsconfig проекта собран под DOM, поэтому глобалов воркера в типах нет.
// Описываем ровно ту часть DedicatedWorkerGlobalScope, которой пользуемся.
type VisionRaycastWorkerScope = {
  onmessage: ((event: MessageEvent<VisionRaycastWorkerRequest>) => void) | null
  postMessage: (message: VisionRaycastWorkerResponse, transfer: ArrayBufferLike[]) => void
}

const scope = self as unknown as VisionRaycastWorkerScope

let sampleOccluder: OccluderSampler = createOccluderSampler({ kind: 'none' })

function setField(field: VisionOccluderField) {
  sampleOccluder = createOccluderSampler(field)
}

function post(message: VisionRaycastWorkerResponse, transfer: ArrayBufferLike[] = []) {
  scope.postMessage(message, transfer)
}

scope.onmessage = (event: MessageEvent<VisionRaycastWorkerRequest>) => {
  const message = event.data

  if (message.type === 'field') {
    setField(message.field)
    return
  }

  for (const job of message.jobs) {
    const points = buildVisionPolygonPoints(
      sampleOccluder,
      job.originX,
      job.originY,
      job.maxRange,
      job.unitInsideHouse
    )
    post({ type: 'polygon', unitId: job.unitId, token: job.token, points }, [points.buffer])
  }
}

post({ type: 'ready' })
