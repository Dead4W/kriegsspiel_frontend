import type { world } from '@/engine/world/world'
import { WeatherEnum } from '@/engine/units/modifiers/UnitWeatherModifiers'

import { drawFog } from './weathers/fog'
import { drawClouds } from './weathers/clouds'

export class WeatherLayer {
  private time = 0

  draw(ctx: CanvasRenderingContext2D, w: world) {
    const dt = performance.now() / 1000
    this.time += dt

    const cam = w.camera

    ctx.save()

    switch (w.weather.value) {
      case WeatherEnum.Fog:
        drawFog(ctx, cam, this.time)
        break

      case WeatherEnum.Cloudy:
        drawClouds(
          ctx,
          cam,
          this.time
        )
        break
    }

    ctx.restore()
  }
}
