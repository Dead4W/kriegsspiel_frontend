export type vec2 = { x: number; y: number }

export interface mapmeta {
  imageUrl: string
  heightMapUrl: string
  width: number
  height: number
  metersPerPixel: number,
  // на будущее: scale/geo/reference
}

export type MoveFrame = {
  t: number        // секунды от начала движения
  pos: vec2
}
