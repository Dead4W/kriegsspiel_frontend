import type { world } from '@/engine/world/world.ts'
import type { BaseUnit } from '@/engine/units/baseUnit.ts'
import { unitType } from '@/engine/units/types.ts'
import type { Team } from '@/enums/teamKeys.ts'

/**
 * A `direct_view` packet is the complete list of what a team can see at this
 * instant. Everything not in it has left view — which is not the same as
 * having ceased to exist.
 */
export type DirectViewContactRelease = {
  world: world
  playerTeam: Team | string
  /**
   * Whether units that left view stay on the board as last-known state.
   *
   * A rendered client says no: it draws what its commander can see, and a
   * marker left behind would be read as a sighting. A client that keeps its
   * own map says yes, because that is what a map is for — the marker stays
   * where it was last seen and stops claiming to be current.
   */
  preserveLostContacts: boolean
}

function forgetCommands(unit: BaseUnit): void {
  const mutable = unit as unknown as {
    commands?: unknown[]
    futurePos?: { x: number; y: number } | null
  }
  mutable.commands = []
  mutable.futurePos = null
}

/**
 * Clears the current view before a packet is applied, so that whatever the
 * packet does not mention is known to be out of contact.
 */
export function releaseDirectViewContacts(options: DirectViewContactRelease): void {
  const { world: roomWorld, playerTeam, preserveLostContacts } = options

  for (const unit of roomWorld.units.list()) {
    if (!unit.directView) continue

    const isOwnFightingUnit = unit.team === playerTeam && unit.type !== unitType.MESSENGER
    if (!isOwnFightingUnit && !preserveLostContacts) {
      roomWorld.units.remove(unit.id, 'remote')
      continue
    }

    // A client without its own simulation cannot say what a unit it can no
    // longer see is doing, so it stops claiming to know. A client that runs
    // the engine keeps the queue and carries the unit forward on it.
    if (!preserveLostContacts) forgetCommands(unit)

    unit.directView = false
    unit.isDirectChain = false
    // Belief is not something the server asked for, so it is not sent back.
    roomWorld.units.markSynced(unit)
  }
}
