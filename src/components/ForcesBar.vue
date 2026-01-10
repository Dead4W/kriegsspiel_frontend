<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import { Team } from '@/enums/teamKeys'
import {debugPerformance} from "@/engine/debugPerformance.ts";

const redPower = ref(0);
const bluePower = ref(0);
const totalPower = ref(0);

const bluePercent = computed(() =>
  totalPower.value === 0 ? 50 : (bluePower.value / totalPower.value) * 100
)
const redPercent = computed(() => 100 - bluePercent.value)

function sync(data: {reason: string}) {
  debugPerformance('ForcesBar.sync', () => {
    if (['camera', 'drag'].includes(data.reason)) return;

    redPower.value = 0;
    bluePower.value = 0;
    totalPower.value = 0;

    for (const u of window.ROOM_WORLD.units.list()) {
      if (u.team === Team.RED) {
        redPower.value += u.hp;
      }
      if (u.team === Team.BLUE) {
        bluePower.value += u.hp;
      }
    }
    totalPower.value = redPower.value + bluePower.value;
  })
}

/* LIFE CYCLE */

onMounted(() => {
  window.ROOM_WORLD.events.on('changed', sync)
})
onUnmounted(() => {
  window.ROOM_WORLD.events.off('changed', sync)
})

</script>

<template>
  <div class="forces-bar no-select">
    <div
      class="side blue"
      :style="{ width: bluePercent + '%' }"
    >
      {{ Math.round(bluePower) }}
    </div>

    <div
      class="side red"
      :style="{ width: redPercent + '%' }"
    >
      {{ Math.round(redPower) }}
    </div>
  </div>
</template>

<style scoped>
.forces-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;

  height: 10px;
  display: flex;
  pointer-events: none;
  z-index: 20;
}

.side {
  height: 100%;
  font-size: 10px;
  line-height: 10px;
  text-align: center;
  white-space: nowrap;
}

.blue {
  background: linear-gradient(90deg, #2563eb, #60a5fa);
  color: #dbeafe;
}

.red {
  background: linear-gradient(270deg, #dc2626, #f87171);
  color: #fee2e2;
}
</style>
