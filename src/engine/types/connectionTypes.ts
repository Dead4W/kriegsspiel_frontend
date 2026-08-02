export type ConnectionInfo = {
  id: number
  team: string
  user?: string
  user_id?: number
  is_ready?: boolean
  /** Set when the connected player is automated rather than a person. */
  is_bot?: boolean
}

export type PlayerReadyInfo = {
  user_id: number
  user?: string
  team: string
  is_ready: boolean
}
