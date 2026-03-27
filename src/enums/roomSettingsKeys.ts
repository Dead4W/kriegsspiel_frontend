
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
  MAP_METERS_PER_PIXEL: 'metersPerPixel',

  RESOURCE_PACK_URL: 'resourcePackUrl',
} as const

export type RoomSettingKey =
  typeof ROOM_SETTING_KEYS[keyof typeof ROOM_SETTING_KEYS]
