import type { VisionOccluderField } from './visionRaycastCore.ts'
import type {
  VisionRaycastJob,
  VisionRaycastWorkerRequest,
  VisionRaycastWorkerResponse,
} from './visionRaycastProtocol.ts'

// Воркер обязан представиться до истечения таймаута. Конструктор Worker падает
// синхронно далеко не всегда: при отсутствии поддержки module worker'ов или при
// неверном MIME-типе ошибка приходит асинхронно, а иногда не приходит вообще.
const WORKER_HANDSHAKE_TIMEOUT_MS = 4000

// Упавший воркер не обязан прислать onerror (например, при нехватке памяти),
// поэтому молчание дольше этого срока тоже считается отказом.
const WORKER_RESPONSE_TIMEOUT_MS = 3000

type WorkerState = 'stopped' | 'handshake' | 'ready' | 'unavailable'

export type VisionRaycastPolygonHandler = (
  unitId: string,
  token: number,
  points: Float32Array
) => void

let worker: Worker | null = null
let state: WorkerState = 'stopped'
let handshakeTimeoutId: number | null = null
let sentFieldVersion = -1
let outstandingJobs = 0
let lastWorkerProgressAt = 0
let polygonHandler: VisionRaycastPolygonHandler | null = null
let workerDisabledHandler: (() => void) | null = null

export function setVisionRaycastPolygonHandler(handler: VisionRaycastPolygonHandler | null) {
  polygonHandler = handler
}

export function setVisionRaycastWorkerDisabledHandler(handler: (() => void) | null) {
  workerDisabledHandler = handler
}

function post(message: VisionRaycastWorkerRequest) {
  worker?.postMessage(message)
}

function clearHandshakeTimeout() {
  if (handshakeTimeoutId == null) return
  window.clearTimeout(handshakeTimeoutId)
  handshakeTimeoutId = null
}

/**
 * Отключает воркер до конца сессии. Вызывающая сторона после этого всегда идёт
 * по синхронному пути в основном потоке.
 */
function disableWorker(reason: string) {
  if (state === 'unavailable') return

  clearHandshakeTimeout()
  worker?.terminate()
  worker = null
  state = 'unavailable'
  sentFieldVersion = -1
  outstandingJobs = 0
  console.warn(`[vision] raycast worker disabled, falling back to main thread: ${reason}`)
  workerDisabledHandler?.()
}

function handleMessage(event: MessageEvent<VisionRaycastWorkerResponse>) {
  const message = event.data

  if (message.type === 'ready') {
    clearHandshakeTimeout()
    state = 'ready'
    return
  }

  outstandingJobs = Math.max(0, outstandingJobs - 1)
  lastWorkerProgressAt = performance.now()
  polygonHandler?.(message.unitId, message.token, message.points)
}

function startWorker() {
  if (state !== 'stopped') return

  if (typeof Worker === 'undefined') {
    disableWorker('Worker is not supported')
    return
  }

  try {
    worker = new Worker(new URL('./visionRaycast.worker.ts', import.meta.url), {
      type: 'module',
    })
  } catch (error) {
    disableWorker(String(error))
    return
  }

  state = 'handshake'
  worker.onmessage = handleMessage
  worker.onerror = (event) => disableWorker(event.message || 'worker error')
  worker.onmessageerror = () => disableWorker('worker message could not be deserialized')
  handshakeTimeoutId = window.setTimeout(
    () => disableWorker('worker did not start in time'),
    WORKER_HANDSHAKE_TIMEOUT_MS
  )
}

/**
 * Отдаёт пачку лучей воркеру. false означает "считай сам": воркер либо ещё
 * поднимается, либо недоступен в этом окружении. Вызывать нужно каждый кадр,
 * в том числе с пустым списком: на этом же вызове проверяется, что воркер
 * ещё отвечает.
 */
export function submitVisionRaycastJobs(
  field: VisionOccluderField,
  fieldVersion: number,
  jobs: VisionRaycastJob[]
): boolean {
  startWorker()
  if (state !== 'ready') return false

  if (
    outstandingJobs > 0 &&
    performance.now() - lastWorkerProgressAt > WORKER_RESPONSE_TIMEOUT_MS
  ) {
    disableWorker('worker stopped responding')
    return false
  }

  if (sentFieldVersion !== fieldVersion) {
    post({ type: 'field', field })
    sentFieldVersion = fieldVersion
  }

  if (jobs.length) {
    post({ type: 'cast', jobs })
    if (outstandingJobs === 0) lastWorkerProgressAt = performance.now()
    outstandingJobs += jobs.length
  }

  return true
}
