import type {RoomSettingKey} from "@/enums/roomSettingsKeys.ts";
import {world} from "@/engine";
import type {ClientSettingKey} from "@/enums/clientSettingsKeys.ts";
import type {PlayerInfo} from "@/enums/playerInfo.ts";

type RoomSettingsWindowState = Partial<Record<RoomSettingKey, any>> & {
  teamBriefing?: Record<string, string>
  perTeamSettings?: Record<string, Record<string, unknown>>
  activeZones?: unknown[]
}

declare global {
  interface Window {
    env: Record<string, string | undefined>
    ROOM_SETTINGS: RoomSettingsWindowState
    ROOM_PARAMS: Record<string, any>
    CLIENT_SETTINGS: Partial<Record<ClientSettingKey, any>>
    CLIENT_ID: string
    ROOM_WORLD: world,
    INPUT: {
      IGNORE_DRAG: boolean,
      IGNORE_UNIT_INTERACTION: boolean,
    }
    PLAYER: PlayerInfo;
    ROOM_KEYS: {
      admin_key: string,
      red_key: string,
      blue_key: string,
    }
    RESOURCEPACK: any
  }
}
