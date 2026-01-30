import type {world} from '@/engine/world/world'
import {WeatherEnum} from '@/engine/units/modifiers/UnitWeatherModifiers'

import {drawFog} from './weathers/fog'
import {drawClouds} from './weathers/clouds'
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";

export class WeatherLayer {
  draw(ctx: CanvasRenderingContext2D, w: world) {
    if (!window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SHOW_WEATHER_SHADERS]) return;

    // Feed shaders a stable clock (ms since page load).
    // Individual shaders compute their own dt from this value.
    const time = performance.now()

    const cam = w.camera

    ctx.save()

    switch (w.weather.value) {
      case WeatherEnum.HeavyFog:
        drawFog(ctx, cam, time, 1.2)
        break
      case WeatherEnum.Fog:
        drawFog(ctx, cam, time, 1)
        break

      case WeatherEnum.Cloudy:
        drawClouds(
          ctx,
          cam,
          time
        )
        break
    }

    ctx.restore()
  }
}
