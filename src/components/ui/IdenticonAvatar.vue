<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    value: string
    size?: number
  }>(),
  {
    size: 28,
  }
)

const GRID_SIZE = 5
const MIRROR_SOURCE_COLUMNS = 3

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function xorshift32(seed: number): () => number {
  let state = seed || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state >>> 0
  }
}

function colorFromSeed(seed: number): string {
  const hue = seed % 360
  return `hsl(${hue} 90% 62%)`
}

const svgMarkup = computed(() => {
  const normalizedValue = props.value?.trim() || '?'
  const seed = hashString(normalizedValue.toLowerCase())
  const random = xorshift32(seed)

  const color = colorFromSeed(seed)
  const background = '#0d1117'

  const cells: string[] = []
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < MIRROR_SOURCE_COLUMNS; x += 1) {
      const shouldFill = (random() & 1) === 1
      if (!shouldFill) continue

      const mirroredX = GRID_SIZE - 1 - x
      cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${color}" />`)
      if (mirroredX !== x) {
        cells.push(`<rect x="${mirroredX}" y="${y}" width="1" height="1" fill="${color}" />`)
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID_SIZE} ${GRID_SIZE}" width="${props.size}" height="${props.size}" shape-rendering="crispEdges">`,
    `<rect width="${GRID_SIZE}" height="${GRID_SIZE}" fill="${background}" />`,
    ...cells,
    '</svg>',
  ].join('')
})
</script>

<template>
  <span
    class="identicon-avatar"
    role="img"
    aria-hidden="true"
    v-html="svgMarkup"
  />
</template>

<style scoped>
.identicon-avatar {
  display: block;
  width: 100%;
  height: 100%;
}

.identicon-avatar :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
