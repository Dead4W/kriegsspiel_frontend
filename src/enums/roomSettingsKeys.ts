
export const ROOM_SETTING_KEYS = {
  UUID: 'uuid',

  RED_TEAM_NAME: 'redTeamName',
  BLUE_TEAM_NAME: 'blueTeamName',

  LIMITED_AMMO: 'limitedAmmo',
  GENERAL_VISION_UPDATE: 'generalVisionUpdate',
  AUTO_STATS_UPDATE: 'autoStatsUpdate',
} as const

export type RoomSettingKey =
  typeof ROOM_SETTING_KEYS[keyof typeof ROOM_SETTING_KEYS]
