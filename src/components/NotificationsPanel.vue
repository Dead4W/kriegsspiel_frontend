<script setup lang="ts">
import {computed, onMounted, onUnmounted, type Ref, ref} from "vue";
import {useI18n} from 'vue-i18n'
import {world} from "@/engine";
import {BaseUnit} from "@/engine/units/baseUnit.ts";

const { t } = useI18n()

export type NotificationItem = {
  id: string
  text: string
  count: number
  onClick: () => void
}

const notifications: Ref<NotificationItem[]> = ref([]);

function focusUnits(units: BaseUnit[]) {
  if (!units.length) return

  const w = window.ROOM_WORLD
  const cam = w.camera

  for (const u of w.units.list()) {
    u.selected = false
  }


  // центр группы юнитов
  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  for (const u of units) {
    minX = Math.min(minX, u.pos.x)
    minY = Math.min(minY, u.pos.y)
    maxX = Math.max(maxX, u.pos.x)
    maxY = Math.max(maxY, u.pos.y)
    u.selected = true
  }

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  // размер видимой области
  const halfW = cam.viewport.x / cam.zoom / 2
  const halfH = cam.viewport.y / cam.zoom / 2

  cam.pos.x = centerX - halfW
  cam.pos.y = centerY - halfH

  cam.clampToWorld()
  w.events.emit('changed', { reason: 'camera' })
}

function refreshNotifications() {
  const units = window.ROOM_WORLD.units.list()

  const unitsWithNewOrder = units.filter(u => window.ROOM_WORLD.units.withNewCommands.has(u.id))
  const unitsWithoutOrder = units.filter(u => u.getCommands().length === 0)

  const result = []

  if (unitsWithNewOrder.length > 0) {
    result.push({
      id: 'with-order',
      text: t('notifications.units_with_new_order'),
      count: unitsWithNewOrder.length,
      onClick: () => {
        focusUnits(unitsWithNewOrder)
      }
    })
  }

  if (unitsWithoutOrder.length > 0) {
    result.push({
      id: 'without-order',
      text: t('notifications.units_without_order'),
      count: unitsWithoutOrder.length,
      onClick: () => {
        focusUnits(unitsWithoutOrder)
      }
    })
  }

  notifications.value = result
}

function onChanged(data: { reason: string}) {
  refreshNotifications();
}

onMounted(() => {
  refreshNotifications();
  window.ROOM_WORLD.events.on('changed', onChanged)
})

onUnmounted(() => {
  window.ROOM_WORLD.events.off('changed', onChanged)
})

</script>

<template>
  <TransitionGroup
    name="notify"
    tag="div"
    class="notifications no-select"
  >
    <div
      v-for="item in notifications"
      :key="item.id"
      class="notification"
      :data-type="item.id"
      @click="item.onClick"
    >
      <div class="left">
        <span class="icon">
          {{ item.id === 'with-order' ? '✅' : '⚠️' }}
        </span>
        <span class="text">{{ item.text }}</span>
      </div>

      <span class="badge">{{ item.count }}</span>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.notifications {
  position: absolute;
  right: 16px;
  bottom: 16px;

  display: flex;
  flex-direction: column;
  gap: 10px;

  pointer-events: auto;

  z-index: 10;
}

/* карточка */
.notification {
  min-width: 260px;
  padding: 12px 14px;

  display: flex;
  align-items: center;
  justify-content: space-between;

  background: linear-gradient(
    180deg,
    rgba(15, 23, 42, 0.9),
    rgba(2, 6, 23, 0.85)
  );

  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 14px;

  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);

  color: #e5e7eb;
  cursor: pointer;

  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.35),
    inset 0 0 0 1px rgba(255,255,255,0.02);

  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}

.notification:hover {
  transform: translateY(-1px);
  box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.45),
    inset 0 0 0 1px rgba(255,255,255,0.04);
}

/* левая часть */
.left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon {
  font-size: 18px;
  line-height: 1;
}

/* текст */
.text {
  font-size: 14px;
  line-height: 1.2;
}

/* бейдж */
.badge {
  min-width: 28px;
  height: 28px;
  padding: 0 8px;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  border-radius: 999px;
  font-weight: 700;
  font-size: 13px;

  background: rgba(255,255,255,0.08);
  color: white;
}

/* типы уведомлений */
.notification[data-type="with-order"] {
  border-color: rgba(34, 197, 94, 0.35);
}

.notification[data-type="with-order"] .badge {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.notification[data-type="without-order"] {
  border-color: rgba(234, 179, 8, 0.35);
}

.notification[data-type="without-order"] .badge {
  background: rgba(234, 179, 8, 0.25);
  color: #fde047;
}

/* анимация */
.notify-enter-active,
.notify-leave-active {
  transition: all 0.2s ease;
}

.notify-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.notify-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
