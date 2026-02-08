<script setup lang="ts">
import { computed, ref } from 'vue'

type DropIndex = number

const props = defineProps<{
  items: unknown[]
  getKey: (item: unknown) => string
}>()

const emit = defineEmits<{
  reorder: [payload: { orderedKeys: string[]; draggedKey: string; dropIndex: number }]
}>()

const draggedKey = ref<string | null>(null)
const dropIndex = ref<DropIndex | null>(null)

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function isScrollableY(el: HTMLElement) {
  const style = window.getComputedStyle(el)
  const oy = style.overflowY
  if (oy !== 'auto' && oy !== 'scroll') return false
  return el.scrollHeight > el.clientHeight + 1
}

function findScrollableAncestor(start: EventTarget | null): HTMLElement | null {
  let el: HTMLElement | null =
    start instanceof HTMLElement ? start : null

  while (el) {
    if (isScrollableY(el)) return el
    el = el.parentElement
  }
  return null
}

function autoScroll(e: DragEvent) {
  // During HTML5 drag-and-drop, mouse wheel scrolling is often blocked by the browser.
  // Provide autoscroll when the cursor is near the top/bottom edge of a scroll container.
  const scrollEl = findScrollableAncestor(e.target)
  if (!scrollEl) return

  const rect = scrollEl.getBoundingClientRect()
  const edge = 32
  const maxStep = 22

  if (e.clientY < rect.top + edge) {
    const t = (rect.top + edge - e.clientY) / edge
    scrollEl.scrollTop -= Math.ceil(maxStep * Math.min(1, t))
  } else if (e.clientY > rect.bottom - edge) {
    const t = (e.clientY - (rect.bottom - edge)) / edge
    scrollEl.scrollTop += Math.ceil(maxStep * Math.min(1, t))
  }
}

function setEmptyDragImage(e: DragEvent) {
  if (!e.dataTransfer) return
  // Hide browser ghost image (we render preview inside list)
  const img = document.createElement('canvas')
  img.width = 1
  img.height = 1
  e.dataTransfer.setDragImage(img, 0, 0)
}

function itemsWithoutKey(items: unknown[], key: string) {
  return items.filter(i => props.getKey(i) !== key)
}

const renderItems = computed(() => {
  const key = draggedKey.value
  if (!key) return props.items

  const items = props.items
  const dragged = items.find(i => props.getKey(i) === key) ?? null
  if (!dragged) return items

  const listWithout = itemsWithoutKey(items, key)
  const idx = clamp(dropIndex.value ?? listWithout.length, 0, listWithout.length)

  return [
    ...listWithout.slice(0, idx),
    dragged,
    ...listWithout.slice(idx),
  ]
})

function updateDropIndexOverElement(overKey: string) {
  const key = draggedKey.value
  if (!key) return

  const listWithout = itemsWithoutKey(props.items, key)
  const overIndex = listWithout.findIndex(i => props.getKey(i) === overKey)
  if (overIndex < 0) return
  // Simpler behavior: hovering an element means "replace it"
  // (i.e. insert dragged item at the hovered element's index).
  dropIndex.value = overIndex
}

function updateDropIndexToEnd() {
  const key = draggedKey.value
  if (!key) return
  const listWithout = itemsWithoutKey(props.items, key)
  dropIndex.value = listWithout.length
}

function clearDrag() {
  draggedKey.value = null
  dropIndex.value = null
}

function applyDrop() {
  const key = draggedKey.value
  if (!key) return

  const items = props.items
  const dragged = items.find(i => props.getKey(i) === key) ?? null
  if (!dragged) return

  const listWithout = itemsWithoutKey(items, key)
  const idx = clamp(dropIndex.value ?? listWithout.length, 0, listWithout.length)
  const ordered = [
    ...listWithout.slice(0, idx),
    dragged,
    ...listWithout.slice(idx),
  ]

  emit('reorder', {
    orderedKeys: ordered.map(props.getKey),
    draggedKey: key,
    dropIndex: idx,
  })
}

function onDragStart(item: unknown, e: DragEvent) {
  const key = props.getKey(item)
  draggedKey.value = key
  dropIndex.value = Math.max(0, props.items.findIndex(i => props.getKey(i) === key))

  // Required for Firefox to initiate DnD
  e.dataTransfer?.setData('text/plain', key)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  setEmptyDragImage(e)
}

function onDragEnd() {
  clearDrag()
}

function onDragOverList(e: DragEvent) {
  if (!draggedKey.value) return
  autoScroll(e)
  updateDropIndexToEnd()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDropOnList(e: DragEvent) {
  if (!draggedKey.value) return clearDrag()
  updateDropIndexToEnd()
  applyDrop()
  clearDrag()
}

function onDragOverItem(item: unknown, e: DragEvent) {
  if (!draggedKey.value) return
  autoScroll(e)
  updateDropIndexOverElement(props.getKey(item))
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDropOnItem(item: unknown, e: DragEvent) {
  if (!draggedKey.value) return clearDrag()
  updateDropIndexOverElement(props.getKey(item))
  applyDrop()
  clearDrag()
}

function listBind() {
  return {
    onDragover: (e: DragEvent) => {
      e.preventDefault()
      onDragOverList(e)
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      onDropOnList(e)
    },
  }
}

function itemBind(item: unknown) {
  const key = props.getKey(item)
  return {
    draggable: true,
    'data-sortable-key': key,
    class: {
      dragging: draggedKey.value === key,
    },
    onDragstart: (e: DragEvent) => onDragStart(item, e),
    onDragend: () => onDragEnd(),
    onDragover: (e: DragEvent) => {
      e.stopPropagation()
      e.preventDefault()
      onDragOverItem(item, e)
    },
    onDrop: (e: DragEvent) => {
      e.stopPropagation()
      e.preventDefault()
      onDropOnItem(item, e)
    },
  }
}
</script>

<template>
  <slot
    :renderItems="renderItems"
    :draggedKey="draggedKey"
    :dropIndex="dropIndex"
    :listBind="listBind"
    :itemBind="itemBind"
  />
</template>

