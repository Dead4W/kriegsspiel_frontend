export type ConnectionInfo = {
  id: number
  team: string
  user?: string
  user_id?: number
  is_ready?: boolean
}

export type PlayerReadyInfo = {
  user_id: number
  user?: string
  team: string
  is_ready: boolean
}
