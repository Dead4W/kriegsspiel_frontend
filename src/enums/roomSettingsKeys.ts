
export const ROOM_SETTING_KEYS = {
  UUID: 'uuid',

  RED_TEAM_NAME: 'redTeamName',
  BLUE_TEAM_NAME: 'blueTeamName',

  LIMITED_AMMO: 'limitedAmmo',
  GENERAL_VISION_UPDATE: 'generalVisionUpdate',
  AUTO_STATS_UPDATE: 'autoStatsUpdate',

  TIME_MODIFIERS: 'timeModifiers',
  WEATHER_MODIFIERS: 'weatherModifiers',

  MAP_URL: 'mapUrl',
  HEIGHT_MAP_URL: 'heightMapUrl',
} as const

export type RoomSettingKey =
  typeof ROOM_SETTING_KEYS[keyof typeof ROOM_SETTING_KEYS]
