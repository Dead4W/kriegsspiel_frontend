import type { vec2 } from './types'

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function add(a: vec2, b: vec2): vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function sub(a: vec2, b: vec2): vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function mul(a: vec2, k: number): vec2 {
  return { x: a.x * k, y: a.y * k }
}

export function normalize(v: vec2): vec2 {
  const len = Math.hypot(v.x, v.y) || 1
  return { x: v.x / len, y: v.y / len }
}

export function dot(a: vec2, b: vec2) {
  return a.x * b.x + a.y * b.y
}
