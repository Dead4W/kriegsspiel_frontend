import { ROOM_SETTING_KEYS, type RoomSettingKey } from '../enums/roomSettingsKeys.ts'

export type RoomSettingLevel = 'stable' | 'beta' | 'unstable' | 'wip'
export type RoomSettingType = 'boolean' | 'string'

/**
 * Описание одной настройки комнаты
 */
export interface RoomSetting<T = boolean | string> {
  key: RoomSettingKey
  type: RoomSettingType
  i18nLabel: string
  i18nDescription?: string
  placeholderI18n?: string
  level: RoomSettingLevel
  default: T
}

/**
 * Список всех доступных настроек комнаты
 */
export const ROOM_SETTINGS: readonly RoomSetting[] = [
  // === stable ===
  {
    key: ROOM_SETTING_KEYS.RED_TEAM_NAME,
    type: 'string',
    i18nLabel: 'settings.redTeamName.label',
    i18nDescription: 'settings.redTeamName.description',
    placeholderI18n: 'settings.redTeamName.placeholder',
    level: 'wip',
    default: '',
  },
  {
    key: ROOM_SETTING_KEYS.BLUE_TEAM_NAME,
    type: 'string',
    i18nLabel: 'settings.blueTeamName.label',
    i18nDescription: 'settings.blueTeamName.description',
    placeholderI18n: 'settings.blueTeamName.placeholder',
    level: 'wip',
    default: '',
  },

  // === beta ===
  // {
  //   key: ROOM_SETTING_KEYS.LIMITED_AMMO,
  //   type: 'boolean',
  //   i18nLabel: 'settings.limitedAmmo.label',
  //   i18nDescription: 'settings.limitedAmmo.description',
  //   level: 'wip',
  //   default: false,
  // },
  // {
  //   key: ROOM_SETTING_KEYS.GENERAL_VISION_UPDATE,
  //   type: 'boolean',
  //   i18nLabel: 'settings.generalVisionUpdate.label',
  //   i18nDescription: 'settings.generalVisionUpdate.description',
  //   level: 'wip',
  //   default: false,
  // },
  // {
  //   key: ROOM_SETTING_KEYS.AUTO_STATS_UPDATE,
  //   type: 'boolean',
  //   i18nLabel: 'settings.autoStatsUpdate.label',
  //   i18nDescription: 'settings.autoStatsUpdate.description',
  //   level: 'wip',
  //   default: false,
  // },
] as const

/**
 * Тип состояния всех настроек комнаты
 */
export type RoomSettingsState = {
  [K in RoomSettingKey]: boolean | string
}

/**
 * Утилита для создания дефолтного состояния настроек
 */
export function createDefaultRoomSettings(): RoomSettingsState {
  return Object.fromEntries(
    ROOM_SETTINGS.map(setting => [setting.key, setting.default])
  ) as RoomSettingsState
}
