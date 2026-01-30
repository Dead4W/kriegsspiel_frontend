import type {vec2} from "@/engine/types.ts";

export type PaintStroke = {
  /** Stable id (used for sync/undo) */
  id: string
  /** Client ownership id */
  ownerId: string
  /** World-space polyline */
  points: vec2[]
  /** Canvas stroke style (e.g. '#ff0000' or 'rgba(255,0,0,0.8)') */
  color: string
  /** Line width in screen px at zoom = 1 */
  width: number
  /** Drawing mode. 'erase' uses destination-out compositing. */
  mode?: 'draw' | 'erase'
}

