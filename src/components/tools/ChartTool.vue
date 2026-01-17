<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api/client'

import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'vue-chartjs'
import 'chartjs-adapter-date-fns'
import type {unitstate} from "@/engine";
import {useI18n} from 'vue-i18n'
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys.ts";

const { t } = useI18n()

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend
)

const emit = defineEmits<{
  (e: 'close'): void
}>()

/* ---------------- types ---------------- */

interface Snapshot {
  ingame_time: string
  red: number
  blue: number
}

/* ---------------- state ---------------- */

const route = useRoute()

const loading = ref(true)
const snapshots = ref<Snapshot[]>([])

/* ---------------- api ---------------- */

async function loadSnapshots() {
  const uuid = route.params.uuid as string

  try {
    const res = await api.get(`/room/${uuid}/snapshotsChart`, {
      params: {
        key: window.ROOM_KEYS.admin_key ?? '',
      },
    })
    snapshots.value = res.data
  } catch (e) {
    console.error('Failed to load snapshots', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadSnapshots)

/* ---------------- chart data ---------------- */

const chartData = computed(() => {
  const labels: Date[] = []
  const redData: number[] = []
  const blueData: number[] = []

  // snapshots.value.forEach(snapshot => {
  //   labels.push(new Date(snapshot.ingame_time.replace(' ', 'T')))
  //
  //   let redCommands = 0
  //   let blueCommands = 0
  //
  //   Object.values(snapshot.units).forEach(unit => {
  //     const hp = unit.hp ?? 0
  //
  //     if (unit.team === 'red') redCommands += hp
  //     if (unit.team === 'blue') blueCommands += hp
  //   })
  //
  //   redData.push(redCommands)
  //   blueData.push(blueCommands)
  // })

  snapshots.value.forEach(snapshot => {
    labels.push(new Date(snapshot.ingame_time.replace(' ', 'T')))

    redData.push(snapshot.red)
    blueData.push(snapshot.blue)
  })

  return {
    labels,
    datasets: [
      {
        label: window.ROOM_SETTINGS[ROOM_SETTING_KEYS.RED_TEAM_NAME] ?? t('team.red'),
        data: redData,
        borderColor: '#ff4d4f',
        tension: 0.3,
      },
      {
        label: window.ROOM_SETTINGS[ROOM_SETTING_KEYS.BLUE_TEAM_NAME] ?? t('team.blue'),
        data: blueData,
        borderColor: '#1890ff',
        tension: 0.3,
      },
    ],
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      type: 'time',
      time: {
        unit: 'second',
        displayFormats: {
          second: 'HH:mm:ss',
          minute: 'HH:mm:ss',
          hour: 'HH:mm:ss',
        },
        tooltipFormat: 'HH:mm:ss',
      },
      ticks: {
        source: 'data',
      },
      title: {
        display: true,
        text: 'Ingame time',
      },
    },
    y: {
      beginAtZero: true,
      title: {
        display: true,
        text: 'Commands HP',
      },
    },
  },
}
</script>

<template>
  <div class="snapshots-overlay">
    <button class="close-btn" @click="emit('close')">✕</button>

    <div v-if="loading" class="loading">
      Loading…
    </div>

    <div v-else class="chart-container">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<style scoped>
.snapshots-overlay {
  position: fixed;
  inset: 0;
  background: #0b0b0b;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  pointer-events: all;
}

.close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 20px;
}

.loading {
  margin: auto;
  color: #aaa;
}

.chart-container {
  flex: 1;
  padding: 20px;
}
</style>
