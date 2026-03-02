import type {StatKey} from "@/engine/units/baseUnit.ts";
import { getWeatherMultipliers as getWeatherMultipliersFromPack } from "@/engine/resourcePack/weather.ts";

export type WeatherStatMultiplier = Partial<Record<StatKey, number>>

export function getWeatherMultipliers(): Record<string, WeatherStatMultiplier> {
  return getWeatherMultipliersFromPack()
}
