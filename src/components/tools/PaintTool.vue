<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import type {PaintStroke} from "@/engine/types/paintTypes.ts";

const color = ref("#ff3b30")
const opacity = ref(0.85)
const width = ref(4)

const strokeStyle = computed(() => hexToRgba(color.value, opacity.value))
const eraserStyle = computed(() => `rgba(0,0,0,1)`)

let painting = false
let activePointerId: number | null = null
let currentStroke: PaintStroke | null = null
let lastClient: { x: number; y: number } | null = null
let currentMode: 'draw' | 'erase' = 'draw'

function hexToRgba(hex: string, a: number) {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3
    ? h.split('').map(ch => ch + ch).join('')
    : h
  const n = Number.parseInt(full, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const alpha = Math.max(0, Math.min(1, a))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function isUiEventTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el?.closest?.('.krig-ui')
}

function isTextInputTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName?.toLowerCase?.()
  return tag === 'input' || tag === 'textarea' || tag === 'select'
}

function worldPosFromEvent(e: PointerEvent) {
  return window.ROOM_WORLD.camera.screenToWorld({ x: e.clientX, y: e.clientY })
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0 && e.button !== 2) return
  if (isUiEventTarget(e.target)) return
  if (painting) return
  e.preventDefault()

  painting = true
  activePointerId = e.pointerId
  lastClient = { x: e.clientX, y: e.clientY }
  currentMode = e.button === 2 ? 'erase' : 'draw'

  const p = worldPosFromEvent(e)
  currentStroke = {
    id: crypto.randomUUID(),
    ownerId: window.CLIENT_ID,
    points: [p],
    color: currentMode === 'erase' ? eraserStyle.value : strokeStyle.value,
    width: width.value,
    mode: currentMode,
  }

  // Add immediately so drawing is visible while dragging.
  window.ROOM_WORLD.addPaintStroke(currentStroke)
}

function onPointerMove(e: PointerEvent) {
  if (!painting) return
  if (activePointerId !== e.pointerId) return
  if (!currentStroke) return

  const last = lastClient
  if (!last) return

  const dx = e.clientX - last.x
  const dy = e.clientY - last.y

  // Basic throttling: only sample when moved enough in screen space.
  if (dx * dx + dy * dy < 4) return

  lastClient = { x: e.clientX, y: e.clientY }
  currentStroke.points.push(worldPosFromEvent(e))
  // Mark paint layer dirty (the stroke object is mutated in-place).
  window.ROOM_WORLD.touchPaint()
}

function finishStroke() {
  if (!currentStroke) return

  // Avoid storing accidental clicks.
  if (currentStroke.points.length < 2) {
    window.ROOM_WORLD.undoPaint(window.CLIENT_ID)
  } else {
    // Broadcast only completed strokes (local drawing is already visible).
    window.ROOM_WORLD.events.emit('api', {
      type: 'paint_add',
      data: currentStroke,
    })
  }

  painting = false
  activePointerId = null
  currentStroke = null
  lastClient = null
}

function onPointerUp(e: PointerEvent) {
  if (!painting) return
  if (activePointerId !== e.pointerId) return
  finishStroke()
}

function onPointerCancel(e: PointerEvent) {
  if (!painting) return
  if (activePointerId !== e.pointerId) return
  finishStroke()
}

function undo() {
  const removed = window.ROOM_WORLD.undoPaint(window.CLIENT_ID)
  if (removed?.id) {
    window.ROOM_WORLD.events.emit('api', {
      type: 'paint_undo',
      data: { id: removed.id },
    })
  }
}

function onKeyDown(e: KeyboardEvent) {
  // Don’t steal undo from text inputs.
  if (isTextInputTarget(e.target)) return

  const isUndo = (e.ctrlKey || e.metaKey) && e.code === 'KeyZ'
  if (!isUndo || e.repeat) return

  // Prevent browser history/input undo.
  e.preventDefault()

  // If a stroke is in progress, cancel it first.
  if (painting) {
    window.ROOM_WORLD.undoPaint(window.CLIENT_ID)
    painting = false
    activePointerId = null
    currentStroke = null
    lastClient = null
    return
  }

  undo()
}

function onContextMenu(e: MouseEvent) {
  if (isUiEventTarget(e.target)) return
  // While paint tool is active, RMB should act as eraser.
  e.preventDefault()
}

onMounted(() => {
  window.INPUT.IGNORE_DRAG = true;
  window.INPUT.IGNORE_UNIT_INTERACTION = true
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('contextmenu', onContextMenu)
})

onBeforeUnmount(() => {
  window.INPUT.IGNORE_DRAG = false;
  window.INPUT.IGNORE_UNIT_INTERACTION = false
  window.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('contextmenu', onContextMenu)
  finishStroke()
})
</script>

<template>
  <div class="paint-panel">
    <h3>{{ $t('tools.paint.title') }}</h3>

    <div class="row">
      <label>{{ $t('tools.paint.color') }}</label>
      <input type="color" v-model="color" />
    </div>

    <div class="row">
      <label>{{ $t('tools.paint.opacity') }}: {{ Math.round(opacity * 100) }}%</label>
      <input type="range" min="0.1" max="1" step="0.05" v-model.number="opacity" />
    </div>

    <div class="row">
      <label>{{ $t('tools.paint.size') }}: {{ width }}</label>
      <input type="range" min="1" max="20" step="1" v-model.number="width" />
    </div>

    <div class="actions">
      <button @click="undo">{{ $t('tools.paint.undo') }}</button>
    </div>

    <div class="hint">
      {{ $t('tools.paint.hint') }}
    </div>
  </div>
</template>

<style scoped>
.paint-panel {
  position: absolute;
  top: 64px;
  left: 16px;

  width: 260px;
  padding: 12px;

  background: #020617ee;
  border: 1px solid #334155;
  border-radius: 10px;

  color: white;
  pointer-events: auto;
}

h3 {
  margin: 0 0 10px;
  font-size: 14px;
}

.row {
  margin-bottom: 10px;
}

label {
  display: block;
  font-size: 12px;
  margin-bottom: 4px;
  color: #94a3b8;
}

input[type="range"] {
  width: 100%;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}

button {
  padding: 6px;
  border-radius: 8px;
  border: 1px solid #334155;
  background: #020617;
  color: white;
  cursor: pointer;
}

button:hover {
  background: rgba(21, 32, 83, 0.8);
}

button.danger {
  background: #7f1d1d;
  border-color: #991b1b;
}

.hint {
  margin-top: 10px;
  font-size: 11px;
  color: #94a3b8;
}
</style>

