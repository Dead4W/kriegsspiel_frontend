export type OverlayLine = {
  type: 'line'
  from: { x: number; y: number }
  to: { x: number; y: number }
  color?: string
  width?: number

  /** Пунктир */
  dash?: number[]        // например [6, 6]
  dashOffset?: number    // для анимации
}

export type OverlayCircle = {
  type: 'circle'
  center: { x: number; y: number }
  radius: number
  color?: string
  strokeColor?: string
  fill?: boolean
}

export type OverlayText = {
  type: 'text'
  pos: { x: number; y: number }
  text: string

  color?: string
  size?: number
  angle?: number

  strokeColor?: string
  strokeWidth?: number

  font?: string
}

export type OverlayRect = {
  type: 'rect'
  from: { x: number; y: number }
  to: { x: number; y: number }

  color?: string        // обводка
  width?: number        // толщина линии
  fillColor?: string    // заливка (опционально)
}

export type OverlayItem =
  | OverlayLine
  | OverlayCircle
  | OverlayText
  | OverlayRect
