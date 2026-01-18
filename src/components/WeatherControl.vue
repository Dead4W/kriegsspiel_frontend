<script setup lang="ts">
import {computed, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {WeatherEnum} from '@/engine/units/modifiers/UnitWeatherModifiers.ts'
import {Team} from '@/enums/teamKeys.ts'
import {RoomGameStage} from "@/enums/roomStage.ts";

const { t } = useI18n()

const weather = window.ROOM_WORLD.newWeather
const isAdmin = computed(() => window.PLAYER.team === Team.ADMIN)

watch(window.ROOM_WORLD.newWeather, () => {
  if (window.ROOM_WORLD.stage !== RoomGameStage.PLANNING) return

  window.ROOM_WORLD.events.emit('api', {type: 'weather', data: window.ROOM_WORLD.newWeather.value});
  window.ROOM_WORLD.weather.value = window.ROOM_WORLD.newWeather.value;
})

const options = Object.values(WeatherEnum)
</script>

<template>
  <div v-if="isAdmin" class="weather-control no-select">
    <label>{{ t('weather.title') }}:</label>

    <select v-model="weather">
      <option
        v-for="w in options"
        :key="w"
        :value="w"
        @change="onChangeWeather"
      >
        {{ t(`weather.${w}`) }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.weather-control {
  display: flex;
  align-items: center;
  gap: 6px;

  pointer-events: auto;

  background: #020617cc;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 4px 8px;

  color: white;
  font-size: 13px;
}

.weather-control select {
  background: #020617;
  border: 1px solid #334155;
  color: white;
  border-radius: 6px;
  padding: 2px 6px;
}
</style>
