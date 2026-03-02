import type {world} from '@/engine/world/world'
import { getWeatherEffect } from '@/engine/resourcePack/weather'

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

    const effect = getWeatherEffect(w.weather.value)
    if (effect?.type === 'fog') {
      drawFog(ctx, cam, time, effect.mult ?? 1)
    } else if (effect?.type === 'clouds') {
      drawClouds(ctx, cam, time)
    }

    ctx.restore()
  }
}
