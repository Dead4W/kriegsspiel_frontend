import type { vec2 } from '@/engine/types'
import type { uuid } from '@/engine/units/types'
import { UnitCommandTypes } from '@/engine/units/enums/UnitCommandTypes'

export const UNIT_COMMAND_REQUEST_EVENT = 'krig:unit-command-request'

export type UnitCommandMoveRequest = {
  pos: vec2
  append: boolean

  /** Optional override for drag-based commands */
  moveMode?: 'column' | 'formation'

  /** If true, UI should instantly confirm after applying target */
  autoConfirm?: boolean
}

export type UnitCommandRequest =
  | {
      command: UnitCommandTypes.Attack | UnitCommandTypes.Delivery
      selectUnitId: uuid
    }
  | {
      command: UnitCommandTypes.Move
      move: UnitCommandMoveRequest
    }

export function emitUnitCommandRequest(req: UnitCommandRequest) {
  window.dispatchEvent(
    new CustomEvent<UnitCommandRequest>(UNIT_COMMAND_REQUEST_EVENT, {
      detail: req,
    })
  )
}

export function onUnitCommandRequest(
  cb: (req: UnitCommandRequest) => void
): () => void {
  const handler = (e: Event) => {
    const ce = e as CustomEvent<UnitCommandRequest>
    if (!ce.detail) return
    cb(ce.detail)
  }
  window.addEventListener(UNIT_COMMAND_REQUEST_EVENT, handler as EventListener)
  return () =>
    window.removeEventListener(
      UNIT_COMMAND_REQUEST_EVENT,
      handler as EventListener
    )
}

