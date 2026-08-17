import '@/engine'
import { describe, expect, it } from 'vitest'
import {
  clipSegmentToVisionPolygons,
  clusterIndicesByDistance,
  ENEMY_ATTACK_LINE_GROUP_RADIUS_METERS,
} from '@/engine/world/turnDirectView.ts'

const square: { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
]

describe('clipSegmentToVisionPolygons', () => {
  it('keeps a line that is already inside vision', () => {
    const clipped = clipSegmentToVisionPolygons(
      { x: 20, y: 50 },
      { x: 80, y: 50 },
      [square],
    )

    expect(clipped).not.toBeNull()
    expect(clipped!.t0).toBe(0)
    expect(clipped!.t1).toBe(1)
    expect(clipped!.from).toEqual({ x: 20, y: 50 })
    expect(clipped!.to).toEqual({ x: 80, y: 50 })
  })

  it('clips incoming fire to the vision edge', () => {
    const clipped = clipSegmentToVisionPolygons(
      { x: -50, y: 50 },
      { x: 50, y: 50 },
      [square],
    )

    expect(clipped).not.toBeNull()
    expect(clipped!.from.x).toBeCloseTo(0)
    expect(clipped!.from.y).toBeCloseTo(50)
    expect(clipped!.to).toEqual({ x: 50, y: 50 })
  })

  it('clips outgoing fire at the vision exit', () => {
    const clipped = clipSegmentToVisionPolygons(
      { x: 50, y: 50 },
      { x: 150, y: 50 },
      [square],
    )

    expect(clipped).not.toBeNull()
    expect(clipped!.from).toEqual({ x: 50, y: 50 })
    expect(clipped!.to.x).toBeCloseTo(100)
    expect(clipped!.to.y).toBeCloseTo(50)
  })

  it('hides a line that never enters vision', () => {
    expect(
      clipSegmentToVisionPolygons(
        { x: -50, y: -50 },
        { x: -10, y: -10 },
        [square],
      ),
    ).toBeNull()
  })
})

describe('clusterIndicesByDistance', () => {
  it('groups fire origins within 500m as one attack line', () => {
    const groups = clusterIndicesByDistance(
      [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 1200, y: 0 },
      ],
      ENEMY_ATTACK_LINE_GROUP_RADIUS_METERS,
    )

    expect(groups).toHaveLength(2)
    expect(groups.find((group) => group.length === 2)).toEqual([0, 1])
    expect(groups.find((group) => group.length === 1)).toEqual([2])
  })

  it('keeps origins farther than 500m as separate lines', () => {
    const groups = clusterIndicesByDistance(
      [
        { x: 0, y: 0 },
        { x: 501, y: 0 },
      ],
      ENEMY_ATTACK_LINE_GROUP_RADIUS_METERS,
    )

    expect(groups).toHaveLength(2)
  })
})
