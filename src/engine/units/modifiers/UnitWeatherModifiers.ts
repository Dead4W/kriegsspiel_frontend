import type {StatKey} from "@/engine/units/baseUnit.ts";

export enum WeatherEnum {
  Clear = 'clear',
  Cloudy = 'cloudy',
  Rain = 'rain',
  HeavyRain = 'heavy_rain',
  Fog = 'fog',
  HeavyFog = 'heavy_fog',
  Snow = 'snow',
}


export type WeatherStatMultiplier = Partial<Record<StatKey, number>>

export const WEATHER_MULTIPLIERS: Record<WeatherEnum, WeatherStatMultiplier> = {
  [WeatherEnum.Clear]: {},

  [WeatherEnum.Cloudy]: {},

  [WeatherEnum.Rain]: {
    visionRange: 0.85,
    attackRange: 0.9,
    speed: 0.95,
  },

  [WeatherEnum.HeavyRain]: {
    visionRange: 0.7,
    attackRange: 0.8,
    speed: 0.85,
  },

  [WeatherEnum.Fog]: {
    visionRange: 0.5,
    attackRange: 0.6,
  },

  [WeatherEnum.HeavyFog]: {
    visionRange: 0.15,
    attackRange: 0.25,
  },

  [WeatherEnum.Snow]: {
    visionRange: 0.8,
    speed: 0.85,
  },
}
