<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'

export type RadialMenuItem<T = string> = {
  id: T
  label?: string
  icon?: string
  disabled?: boolean
  active?: boolean
  ariaLabel?: string
}

const props = withDefaults(
  defineProps<{
    open: boolean
    center: { x: number; y: number }
    items: RadialMenuItem<any>[]
    centerItem?: RadialMenuItem<any> | null
    radius?: number
    startAngleDeg?: number
    closeOnSelect?: boolean
    closeOnBackdrop?: boolean
    showLabels?: boolean
    zIndex?: number
  }>(),
  {
    radius: 78,
    startAngleDeg: -90,
    closeOnSelect: true,
    closeOnBackdrop: true,
    showLabels: false,
    zIndex: 60,
    centerItem: null,
  }
)

const emit = defineEmits<{
  (e: 'select', item: RadialMenuItem<any>, ev: PointerEvent): void
  (e: 'close'): void
}>()

const ringPlacements = computed(() => {
  const n = props.items.length
  if (!n) return []

  const start = (props.startAngleDeg * Math.PI) / 180
  const step = (2 * Math.PI) / n

  return props.items.map((_, idx) => {
    const a = start + step * idx
    return {
      x: Math.cos(a) * props.radius,
      y: Math.sin(a) * props.radius,
    }
  })
})

function close() {
  emit('close')
}

function onBackdropPointerDown() {
  if (!props.closeOnBackdrop) return
  close()
}

function onItemPointerDown(item: RadialMenuItem<any>, ev: PointerEvent) {
  if (item.disabled) return
  emit('select', item, ev)
  if (props.closeOnSelect) close()
}

function onKeyDown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    ev.stopPropagation()
    close()
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener('keydown', onKeyDown, true)
    } else {
      window.removeEventListener('keydown', onKeyDown, true)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown, true)
})
</script>

<template>
  <div
    v-if="open"
    class="radial-root"
    :style="{ zIndex: String(zIndex) }"
    @pointerdown="onBackdropPointerDown"
    @contextmenu.prevent
  >
    <div
      class="radial-menu"
      :style="{
        left: `${center.x}px`,
        top: `${center.y}px`,
      }"
      @pointerdown.stop
    >
      <button
        v-if="centerItem"
        class="item center"
        type="button"
        :disabled="!!centerItem.disabled"
        :class="{ active: !!centerItem.active }"
        :aria-label="centerItem.ariaLabel ?? centerItem.label ?? String(centerItem.id)"
        @pointerdown="(ev) => onItemPointerDown(centerItem!, ev)"
      >
        <span v-if="centerItem.icon" class="icon">{{ centerItem.icon }}</span>
        <span v-if="showLabels && centerItem.label" class="label">{{ centerItem.label }}</span>
      </button>

      <button
        v-for="(item, idx) in items"
        :key="String(item.id)"
        class="item"
        type="button"
        :disabled="!!item.disabled"
        :class="{ active: !!item.active }"
        :style="{
          transform: `translate(${ringPlacements[idx]?.x ?? 0}px, ${ringPlacements[idx]?.y ?? 0}px) translate(-50%, -50%)`,
        }"
        :aria-label="item.ariaLabel ?? item.label ?? String(item.id)"
        @pointerdown="(ev) => onItemPointerDown(item, ev)"
      >
        <span v-if="item.icon" class="icon">{{ item.icon }}</span>
        <span v-if="showLabels && item.label" class="label">{{ item.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.radial-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.radial-menu {
  position: absolute;
  width: 0;
  height: 0;
  transform: translate(-50%, -50%);
  pointer-events: auto;
}

.item {
  position: absolute;
  left: 0;
  top: 0;
  transform: translate(-50%, -50%);

  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;

  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 1px solid #334155;
  background: #020617ee;
  color: #e5e7eb;
  cursor: pointer;
  user-select: none;

  transition:
    transform 0.08s ease,
    border-color 0.15s ease,
    background 0.15s ease,
    opacity 0.15s ease;
}

.item:hover {
  border-color: #64748b;
}

.item:active {
  transform: translate(-50%, -50%) scale(0.98);
}

.item:disabled {
  opacity: 0.35;
  cursor: default;
}

.item.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
}

.item.center {
  width: 40px;
  height: 40px;
  background: #0b1220ee;
}

.icon {
  font-size: 16px;
  line-height: 1;
}

.label {
  font-size: 9px;
  line-height: 1;
  max-width: 88px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.9;
}
</style>

