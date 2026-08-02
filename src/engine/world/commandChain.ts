import { unitType } from '@/engine/units/types'
import type { uuid, unitTeam } from '@/engine/units/types'
import type { vec2 } from '@/engine/types.ts'
import { BaseUnit } from '@/engine/units/baseUnit'

/**
 * How far apart two friendly units may stand and still relay orders to one
 * another. It is twice the distance at which the engine considers them to be
 * occupying the same ground, and it is a fixed distance: unlike the general's
 * sight, it does not shrink in darkness or fog.
 */
export const CHAIN_RANGE_METERS = BaseUnit.COLLISION_RANGE_METERS * 2

export type ChainUnit = {
  id: uuid
  team: unitTeam
  type: string
  pos: vec2
}

/**
 * Spreads outwards from the seed units through friendly units standing within
 * `chainRangePx` of one another, and returns everything reached.
 *
 * This is the multi-hop relay that decides which units can be ordered at no
 * cost: whoever is reached is commandable, however far from the general the
 * head of the chain has got. Couriers are not part of it — they carry orders
 * rather than passing them on.
 *
 * Kept as a pure function of the units it is given so that it can be asked
 * about a board that does not exist yet — where a unit would have to stand to
 * close a gap — as well as about the one that does.
 */
export function collectChainLinkedUnitIds(
  units: readonly ChainUnit[],
  seeds: readonly ChainUnit[],
  team: unitTeam,
  chainRangePx: number,
): Set<uuid> {
  const queue = seeds.filter((unit) => unit.team === team)
  const visited = new Set<uuid>(seeds.map((unit) => unit.id))

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const other of units) {
      if (other.id === current.id) continue
      if (other.type === unitType.MESSENGER) continue
      if (other.team !== team) continue
      if (visited.has(other.id)) continue
      if (Math.hypot(
        other.pos.x - current.pos.x,
        other.pos.y - current.pos.y,
      ) > chainRangePx) continue

      visited.add(other.id)
      queue.push(other)
    }
  }

  return visited
}
