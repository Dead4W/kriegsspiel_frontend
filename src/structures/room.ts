import type { uuid } from '@/engine'
import type { Team } from '@/enums/teamKeys'
import type { RoomSettingKey } from '@/enums/roomSettingsKeys'

export type RoomData = {
  uuid: uuid
  team: Team
  name: string
  admin_id: number
  options: Record<RoomSettingKey, any>

  // ADMIN VALUES
  admin_key?: string
  red_key?: string
  blue_key?: string
}

