const CLIENT_SETTINGS_STORAGE_KEY = 'clientSettings';

export const CLIENT_SETTING_KEYS = {
  // TEST: 'test',

  // Инверсия canvas (Тёмная тема)
  DARK_THEME: 'darkTheme',

  // HARD MODE (для админа: drag юнитов = приказ, а не перенос)
  HARD_MODE: 'hardMode',

  // Громкость звука
  SOUND_VOLUME: 'soundVolume',

  // Показывать имя юнита в label
  SHOW_UNIT_LABELS: 'showUnitLabels',

  // Показывать тип юнита в label
  SHOW_UNIT_LABEL_TYPE: 'showUnitLabelType',

  // Прозрачность юнита
  OPACITY_UNIT: 'opacityUnit',

  // Размер юнита
  SIZE_UNIT: 'sizeUnit',

  // Показывать HP юнита на карте
  SHOW_HP_UNIT_ON_MAP: 'showHpUnitOnMap',

  // Показывать область видимости юнита
  SHOW_UNIT_VISION: 'showUnitVision',

  // Показывать область видимости юнита с учетом леса
  SHOW_UNIT_VISION_ONLY_SELECTED: 'showUnitVisionOnlySelected',

  // Показывать область видимости юнита с учетом леса
  SHOW_UNIT_VISION_FOREST_RAYCAST: 'showUnitVisionForestRaycast',

  // Иконки модификатора над юнитом
  SHOW_UNIT_MODIFICATORS: 'showUnitModificators',

  // Показать карту лесов
  SHOW_FOREST_MAP: 'showForestMap',

  // Показать карту высот
  SHOW_HEIGHT_MAP: 'showHeightMap',

  // Размеры чата
  CHAT_HEIGHT: 'chatHeight',
  CHAT_WIDTH: 'chatWidth',

  // Weather shaders
  SHOW_WEATHER_SHADERS: 'showWeatherShaders',

  // Performance debug
  ENABLE_PERFORMANCE_DEBUG: 'enablePerformanceDebug',

  // Show unit detail
  SHOW_UNIT_DETAIL: 'showUnitDetail',
} as const

export type ClientSettingKey =
  typeof CLIENT_SETTING_KEYS[keyof typeof CLIENT_SETTING_KEYS]

// Load client settings
function loadClientSettings(): Partial<Record<ClientSettingKey, any>> {
  try {
    const defaults = getDefaultSettings()
    const raw = localStorage.getItem(CLIENT_SETTINGS_STORAGE_KEY)

    if (!raw) {
      localStorage.setItem(
        CLIENT_SETTINGS_STORAGE_KEY,
        JSON.stringify(defaults)
      )
      return { ...defaults }
    }

    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || !parsed) {
      return { ...defaults }
    }

    // merge: saved values override defaults
    const merged = {
      ...defaults,
      ...parsed,
    }

    // optional: persist merged config (useful when new keys were added)
    localStorage.setItem(
      CLIENT_SETTINGS_STORAGE_KEY,
      JSON.stringify(merged)
    )

    return merged
  } catch {
    return { ...getDefaultSettings() }
  }
}

function getDefaultSettings(): Partial<Record<ClientSettingKey, any>> {
  return {
    [CLIENT_SETTING_KEYS.DARK_THEME]: false,
    [CLIENT_SETTING_KEYS.HARD_MODE]: false,
    [CLIENT_SETTING_KEYS.SOUND_VOLUME]: 0.3,
    [CLIENT_SETTING_KEYS.SHOW_UNIT_LABELS]: true,
    [CLIENT_SETTING_KEYS.SHOW_UNIT_LABEL_TYPE]: false,
    [CLIENT_SETTING_KEYS.OPACITY_UNIT]: 0.8,
    [CLIENT_SETTING_KEYS.SIZE_UNIT]: 1,
    [CLIENT_SETTING_KEYS.SHOW_HP_UNIT_ON_MAP]: true,
    [CLIENT_SETTING_KEYS.SHOW_UNIT_VISION]: true,
    [CLIENT_SETTING_KEYS.SHOW_UNIT_VISION_ONLY_SELECTED]: false,
    [CLIENT_SETTING_KEYS.SHOW_UNIT_VISION_FOREST_RAYCAST]: true,
    [CLIENT_SETTING_KEYS.SHOW_UNIT_MODIFICATORS]: true,
    [CLIENT_SETTING_KEYS.SHOW_FOREST_MAP]: false,
    [CLIENT_SETTING_KEYS.SHOW_HEIGHT_MAP]: false,
    [CLIENT_SETTING_KEYS.SHOW_WEATHER_SHADERS]: true,
    [CLIENT_SETTING_KEYS.CHAT_HEIGHT]: null,
    [CLIENT_SETTING_KEYS.CHAT_WIDTH]: null,
    [CLIENT_SETTING_KEYS.ENABLE_PERFORMANCE_DEBUG]: false,
    [CLIENT_SETTING_KEYS.SHOW_UNIT_DETAIL]: true,
  };
}

// Observer
export function createClientSettings() {
  const initial = loadClientSettings();

  const save = () => {
    localStorage.setItem(
      CLIENT_SETTINGS_STORAGE_KEY,
      JSON.stringify(window.CLIENT_SETTINGS)
    )
  }

  return new Proxy(initial, {
    set(target, prop: ClientSettingKey, value) {
      target[prop] = value;
      window.ROOM_WORLD.events.emit('changed', {reason: 'clientSettings'});
      save()
      return true
    },
    deleteProperty(target, prop: ClientSettingKey) {
      delete target[prop]
      window.ROOM_WORLD.events.emit('changed', {reason: 'clientSettings'});
      save()
      return true
    },
  })
}
