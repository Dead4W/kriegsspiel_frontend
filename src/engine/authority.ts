import { Team } from '@/enums/teamKeys.ts'
import type { ConnectionInfo } from '@/engine/types/connectionTypes.ts'

/**
 * Whether this client is an automated player rather than a person at a screen.
 */
export function isAutomatedPlayer(): boolean {
  return window.PLAYER?.isBot === true
}

/**
 * Whether this client holds the whole board and is expected to advance the
 * rules itself, rather than being told the outcome by someone who does.
 *
 * The umpire's admin client does. So does an automated player: it keeps a
 * private map of the game and runs the engine forward on it between the
 * observations it receives, which is what a commander's map is.
 *
 * This is not a permission. The server grants an automated player nothing an
 * ordinary player does not have — it still refuses `skip_time`, `set_stage`
 * and every other admin message from a player key — and the bot's own orders
 * still go through the player rules in `directViewOrderRules.ts`. The flag
 * says which side of the connection the simulation runs on, nothing more.
 */
export function hasEngineAuthority(): boolean {
  return window.PLAYER?.team === Team.ADMIN || isAutomatedPlayer()
}

/** The subset of the world this module needs, so it stays free of the world. */
type ConnectionListLike = { connections: { value: ConnectionInfo[] } }

/**
 * The teams played by an automated client right now.
 *
 * Read from the live connection list, which only admin and spectator clients
 * receive, so it is empty for everyone else. It is deliberately live rather
 * than remembered: when an automated player drops, its team stops being
 * automated, because a person may pick the seat up.
 */
export function getAutomatedTeams(roomWorld: ConnectionListLike): Set<string> {
  const teams = new Set<string>()
  for (const connection of roomWorld.connections.value) {
    if (connection.is_bot) teams.add(String(connection.team))
  }
  return teams
}

export function isTeamAutomated(roomWorld: ConnectionListLike, team: string | null | undefined): boolean {
  if (!team) return false
  return roomWorld.connections.value.some((connection) => (
    Boolean(connection.is_bot) && String(connection.team) === String(team)
  ))
}
