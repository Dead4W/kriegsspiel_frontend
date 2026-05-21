
export const ROOM_SETTING_KEYS = {
  UUID: 'uuid',

  RED_TEAM_NAME: 'redTeamName',
  BLUE_TEAM_NAME: 'blueTeamName',

  LIMITED_AMMO: 'limitedAmmo',
  GENERAL_VISION_UPDATE: 'generalVisionUpdate',
  AUTO_STATS_UPDATE: 'autoStatsUpdate',
  IS_PLAYER_ROOM_MAP: 'isPlayerRoomMap',

  TIME_MODIFIERS: 'timeModifiers',
  WEATHER_MODIFIERS: 'weatherModifiers',

  MAP_URL: 'mapUrl',
  HEIGHT_MAP_URL: 'heightMapUrl',
  OBJECT_MAP_URL: 'objectMapUrl',
  OBJECT_MAP_META_URL: 'objectMapMetaUrl',
  MAP_METERS_PER_PIXEL: 'metersPerPixel',
} as const

export type RoomSettingKey =
  typeof ROOM_SETTING_KEYS[keyof typeof ROOM_SETTING_KEYS]
