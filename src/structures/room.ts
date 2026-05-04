import type { uuid } from '@/engine'
import type { Team } from '@/enums/teamKeys'
import type { RoomSettingKey } from '@/enums/roomSettingsKeys'
import type { RoomGameStage } from '@/enums/roomStage'
import type { Weather } from '@/engine/resourcePack/weather'

export type RoomMapUser = {
  id: number
  name: string
}

export type RoomMapInfo = {
  room_map_id: number
  team: Team
  user: RoomMapUser | null
}

export type RoomData = {
  uuid: uuid
  team: Team
  stage?: RoomGameStage
  name: string
  weather?: Weather
  ingame_time?: string
  admin_id: number
  options: Record<RoomSettingKey, any>
  room_maps?: RoomMapInfo[]

  // ADMIN VALUES
  admin_key?: string
  red_key?: string
  blue_key?: string
}

