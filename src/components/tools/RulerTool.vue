<script setup lang="ts">
import {ref, onMounted, onBeforeUnmount, type UnwrapRef} from 'vue'
import type {
  OverlayLine,
  OverlayText,
  OverlayItem,
} from '@/engine/types/overlayTypes'

const points = ref<{ x: number; y: number }[]>([])
const preview = ref<{ x: number; y: number } | null>(null)

/* ===== utils ===== */

function distance(a: any, b: any) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function mid(a: any, b: any) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

function angleAtan2(a: any, b: any) {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

function readableAngle(angle: number) {
  if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
    return {
      angle: angle + Math.PI,
      flipped: true,
    }
  }

  return {
    angle,
    flipped: false,
  }
}

/* ===== overlay build ===== */

function rebuildOverlay() {
  const items: OverlayItem[] = []

  let totalDistance = 0;

  for (let i = 0; i < points.value.length - 1; i++) {
    const a = points.value[i]
    const b = points.value[i + 1]

    const d = distance(a, b) * window.ROOM_WORLD.map.metersPerPixel;
    totalDistance += d;
    const m = mid(a, b)
    const rawAngle = angleAtan2(a, b);
    const { angle, flipped } = readableAngle(rawAngle)

    const sign = flipped ? -1 : 1

    const normalOffset = 14

    if (a === undefined || b === undefined) return;

    items.push({
      type: 'line',
      from: a,
      to: b,
      color: '#000',
      width: 5,
    } satisfies OverlayLine)

    items.push({
      type: 'line',
      from: a,
      to: b,
      color: '#3cff00',
      width: 4,
    } satisfies OverlayLine)

    items.push(
      {
        type: 'text',
        pos: {
          x: m.x - Math.sin(angle) * normalOffset * sign,
          y: m.y + Math.cos(angle) * normalOffset * sign,
        },
        text: `${Math.round(totalDistance)} M`,
        angle,
        size: 24,

        strokeColor: '#000',
        strokeWidth: 1,

        color: '#3cff00',
      } satisfies OverlayText
    )
  }

  // preview сегмент
  if (points.value.length && preview.value) {
    items.push({
      type: 'line',
      from: points.value[points.value.length - 1]!,
      to: preview.value,
      color: '#3cff0088',
      width: 1,
    })
  }

  window.ROOM_WORLD.setOverlay(items)
  window.ROOM_WORLD.events.emit('api', {
    type: 'ruler',
    data: { points: points.value },
  })
}

/* ===== input ===== */

function down(e: PointerEvent) {
  // ПКМ → сброс
  if (e.button === 2) {
    resetRuler()
    return
  }

  const p = window.ROOM_WORLD.camera.screenToWorld({
    x: e.clientX,
    y: e.clientY,
  })

  points.value.push(p)
  preview.value = null
  rebuildOverlay()
}

function resetRuler() {
  points.value = []
  preview.value = null
  window.ROOM_WORLD.clearOverlay()
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    resetRuler()
  }
}

function move(e: PointerEvent) {
  if (!points.value.length) return

  preview.value = window.ROOM_WORLD.camera.screenToWorld({
    x: e.clientX,
    y: e.clientY,
  })

  rebuildOverlay()
}

function up() {
  rebuildOverlay()
}

/* ===== lifecycle ===== */

onMounted(() => {
  window.INPUT.IGNORE_UNIT_INTERACTION = true
  window.addEventListener('pointerdown', down)
  window.addEventListener('pointermove', move)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('pointerup', up)
})

onBeforeUnmount(() => {
  window.INPUT.IGNORE_UNIT_INTERACTION = false
  window.removeEventListener('pointerdown', down)
  window.removeEventListener('pointermove', move)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('pointerup', up)
  window.ROOM_WORLD.clearOverlay();
})
</script>

<template />
