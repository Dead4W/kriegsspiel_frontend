<script setup lang="ts">
import {computed, type ComputedRef, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'

import {useI18n} from 'vue-i18n'
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";
import {Team} from "@/enums/teamKeys.ts";
import {type ChatMessage, ChatMessageStatus} from "@/engine/types/chatMessage.ts";
import {BaseUnit} from "@/engine/units/baseUnit.ts";
import {type unitstate, unitType, type uuid} from "@/engine";
import {RoomGameStage} from "@/enums/roomStage.ts";

const { t } = useI18n()


/* =======================
   CONSTANTS
======================= */

const CHAT_TOP = 62
const BOTTOM_MARGIN = 170

/* =======================
   HELPERS
======================= */

function getLastReadKey(team: Team) {
  return `chat:lastRead:${window.ROOM_SETTINGS.uuid}:${team}`
}

function getLastReadMessageId(team: Team): string | null {
  return localStorage.getItem(getLastReadKey(team))
}

function setLastReadMessageId(team: Team, messageId: string) {
  localStorage.setItem(getLastReadKey(team), messageId)
}

function syncPlayerChatReadState() {
  if (!isPlayer()) {
    return;
  }

  let needRefreshWorld = false;

  const messages = window.ROOM_WORLD.messages.list()
  if (!messages.length) return

  // 1. читаем сохранённый id
  const lastReadId = getLastReadMessageId(window.PLAYER.team)
  if (!lastReadId) {
    return;
  }

  // 2. находим индекс
  let lastReadIndex = -1
  if (lastReadId) {
    lastReadIndex = messages.findIndex(m => m.id === lastReadId)
  }

  // 3. помечаем сообщения
  for (let i = 0; i < messages.length; i++) {
    if (i <= lastReadIndex && messages[i]!.status != ChatMessageStatus.Read) {
      messages[i]!.status = ChatMessageStatus.Read;
      needRefreshWorld = true;
    }
  }

  if (needRefreshWorld) {
    onChangedWorld({ reason: 'init'});
  }
}

function isUnreadMessage(m: ChatMessage): boolean {
  let currentAuthorTeam = window.PLAYER.team;
  if (currentAuthorTeam === Team.SPECTATOR) currentAuthorTeam = Team.ADMIN;

  if (currentAuthorTeam === Team.ADMIN) {
    return m.author_team !== currentAuthorTeam && m.status !== ChatMessageStatus.Read
  } else {
    return m.author_team !== currentAuthorTeam && m.delivered
  }
}

function canSpawnMessenger(m: ChatMessage): boolean {
  return window.PLAYER.team === Team.ADMIN
}

function onSpawnMessenger(m: ChatMessage) {
  const pos = window.ROOM_WORLD.camera.screenToWorld({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  })

  const new_messenger: unitstate = {
    id: crypto.randomUUID(),
    type: unitType.MESSENGER,
    team: m.team === Team.RED ? 'red' : 'blue',
    pos,
    label: t(`unit.${unitType.MESSENGER}`),
    messagesLinked: [{id: m.id, time: window.ROOM_WORLD.time}],
  }
  window.ROOM_WORLD.units.upsert(new_messenger);
  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' })
  window.ROOM_WORLD.units.clearSelection()
  window.ROOM_WORLD.units.get(new_messenger.id)!.selected = true
}

function isAtBottom(container: HTMLElement, threshold = 20) {
  return (
    container.scrollTop + container.clientHeight >=
    container.scrollHeight - threshold
  )
}

function isPlayer() {
  return window.PLAYER.team === Team.BLUE
    || window.PLAYER.team === Team.RED
}

function getSendWarningMessage() {
  if (selectedUnits.value.length === 0) {
    return t('chat.warning.selection_hint');
  }

  if (!isPlayer()) {
    const teams = new Set(selectedUnits.value.map(u => u.team))
    if (teams.size > 1) {
      return t('chat.warning.selection_both_team')
    }
  }

  return null;
}

function isEnd() {
  return window.ROOM_WORLD.stage === RoomGameStage.END
}

function getMessageUnits(m: ChatMessage): BaseUnit[] {
  if (!m.unitIds.length) return []

  const w = window.ROOM_WORLD
  return m.unitIds
    .map(id => w.units.get(id)! ?? id)
}

function focusUnits(units: BaseUnit[]) {
  if (!units.length) return

  const w = window.ROOM_WORLD
  const cam = w.camera

  // центр группы юнитов
  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  for (const u of units) {
    minX = Math.min(minX, u.pos.x)
    minY = Math.min(minY, u.pos.y)
    maxX = Math.max(maxX, u.pos.x)
    maxY = Math.max(maxY, u.pos.y)
  }

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  // размер видимой области
  const halfW = cam.viewport.x / cam.zoom / 2
  const halfH = cam.viewport.y / cam.zoom / 2

  cam.pos.x = centerX - halfW
  cam.pos.y = centerY - halfH

  cam.clampToWorld()
  // w.events.emit('changed', { reason: 'camera' })
}

function onUnitsBlockClick(units: BaseUnit[]) {
  const w = window.ROOM_WORLD

  w.units.clearSelection()
  for (const u of units) {
    u.selected = true
  }

  focusUnits(units)
}

/* =======================
   STATES
======================= */

const isOpen = ref(false)

const width = ref(window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.CHAT_WIDTH] ?? 320)
const height = ref(window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.CHAT_HEIGHT] ?? 420)

const minWidth = 300
const maxWidth = 1000
const minHeight = 220

// Табы
const activeTeam = ref<Team>(Team.ADMIN);
let teams: { id: Team, label: string }[] = [];
if (window.PLAYER.team !== Team.ADMIN && window.PLAYER.team !== Team.SPECTATOR) {
  activeTeam.value = window.PLAYER.team;
  teams = [
    { id: window.PLAYER.team, label: t(`team.${Team.ADMIN}`) },
    { id: Team.ADMIN, label: t('chat.units_messages')}
  ];
} else {
  activeTeam.value = Team.RED;
  teams = [
    { id: Team.RED, label: window.ROOM_SETTINGS.redTeamName ?? t(`team.${Team.RED}`) },
    { id: Team.BLUE, label: window.ROOM_SETTINGS.blueTeamName ?? t(`team.${Team.BLUE}`) },
    { id: Team.ADMIN, label: t('chat.units_messages')}
  ];
}

function parseTime(t: string): number {
  return new Date(t.replace(' ', 'T')).getTime()
}

// Фильтр сообщений по чату
const visibleMessages: ComputedRef<ChatMessage[]> = computed(() => {
  // 👇 вкладка сообщений выделенных юнитов
  if (activeTeam.value === Team.ADMIN) {
    if (!selectedUnits.value.length) return []

    const result: ChatMessage[] = []
    const seenIds = new Set<string>()

    for (const unit of selectedUnits.value) {
      for (const msg of unit.messages ?? []) {
        if (seenIds.has(msg.id)) continue

        seenIds.add(msg.id)
        result.push(msg)
      }
    }

    // сортировка по времени
    result.sort((a, b) => parseTime(a.time) - parseTime(b.time))

    return result
  }

  // обычные чаты
  return messages.value
    .filter(m => m.time <= window.ROOM_WORLD.time)
    .filter(m => m.team === activeTeam.value)
})
const textarea = ref<HTMLTextAreaElement | null>(null)

// Выделенные юниты
const selectedUnits = ref<BaseUnit[]>([]);

// Непрочитанные
const unreadByTeam = computed<Record<Team, number>>(() => {
  const result = {} as Record<Team, number>

  for (const t of teams.map(t => t.id)) {
    if (window.ROOM_WORLD.stage === RoomGameStage.END) {
      result[t] = 0
      continue
    }
    result[t] = messages.value.filter(
      m => m.team === t && isUnreadMessage(m) && m.time <= window.ROOM_WORLD.time
    ).length
  }

  return result
})
const unreadTotal = computed<number>(() => {
  return Object.values(unreadByTeam.value).reduce((sum, count) => sum + count, 0)
})
const unreadInActiveTab = computed(() =>
  unreadByTeam.value[activeTeam.value] ?? 0
)

const wasAtBottom = ref(true)

/* =======================
   CHAT
======================= */

const messages = ref<ChatMessage[]>([])

const input = ref('')

function send() {
  if (!input.value.trim()) return

  const selected = window.ROOM_WORLD.units.getSelected()
    .filter(u => u.type !== unitType.MESSENGER)

  const team = selected[0]!.team as Team;
  const m = {
    id: crypto.randomUUID(),
    author: window.PLAYER.name,
    author_team: window.PLAYER.team,
    unitIds: selected.map(u => u.id),
    text: input.value,
    time: window.ROOM_WORLD.time,
    team: team,
    status: ChatMessageStatus.Sent,
    delivered: false,
  } as ChatMessage;

  window.ROOM_WORLD.addMessage(m);

  for (const u of selected) {
    u.linkMessage(m.id);
    u.setDirty()
  }

  input.value = ''

  nextTick(() => {
    autoResizeInput()
    scrollDown()
  })
}

function scrollDown() {
  const el = document.querySelector('.chat-messages')
  el?.scrollTo({ top: el.scrollHeight })
}

function isMessageAuthorTeam(message_team: Team) {
  if (window.PLAYER.team === Team.SPECTATOR) {
    return message_team === Team.ADMIN;
  }
  return message_team === window.PLAYER.team;
}

function onMessagesScroll() {
  const el = document.querySelector('.chat-messages') as HTMLElement | null
  if (!el) return

  wasAtBottom.value = isAtBottom(el)
}

/* =======================
   TAB
======================= */

function onTabClick(team: Team) {
  activeTeam.value = team
  nextTick(() => {
    scrollDown();
  })
}

function scrollToFirstUnread() {
  const container = document.querySelector('.chat-messages')
  if (!container) return

  const unread = container.querySelector('.chat-message-wrapper.unread')
  if (unread) {
    unread.scrollIntoView({ block: 'center' })
  } else {
    scrollDown()
  }
}

function onClickMarkAsRead(message_id: uuid) {
  const message = window.ROOM_WORLD.messages.get(message_id);
  if (message) {
    window.ROOM_WORLD.messages.markAsRead(message_id);
  }
  onChangedWorld({ reason: 'read'});
}

function onClickMarkAllAsRead() {
  const messages = window.ROOM_WORLD.messages.list();
  let lastId = null;
  for (const message of messages) {
    message.status = ChatMessageStatus.Read;
    lastId = message.id;
  }
  if (lastId) {
    setLastReadMessageId(window.PLAYER.team, lastId);
  }
  onChangedWorld({ reason: 'read'});
}

/* =======================
   UNREAD
======================= */

watch(isOpen, async (open) => {
  if (!open) return

  await nextTick()
  scrollToFirstUnread()
})

/* =======================
   RESIZE
======================= */


let maxAllowedHeight = 1000;

let startX = 0
let startY = 0
let startWidth = 0
let startHeight = 0

function resizeXStart(e: PointerEvent) {
  startX = e.clientX
  startWidth = width.value
  document.addEventListener('pointermove', resizeX)
  document.addEventListener('pointerup', resizeEnd)
}

function resizeYStart(e: PointerEvent) {
  startY = e.clientY
  startHeight = height.value
  document.addEventListener('pointermove', resizeY)
  document.addEventListener('pointerup', resizeEnd)
}

function resizeXYStart(e: PointerEvent) {
  startY = e.clientY
  startHeight = height.value
  startX = e.clientX
  startWidth = width.value
  document.addEventListener('pointermove', resizeXY)
  document.addEventListener('pointerup', resizeEnd)
}

function resizeX(e: PointerEvent) {
  const delta = startX - e.clientX
  width.value = Math.min(
    maxWidth,
    Math.max(minWidth, startWidth + delta)
  )
  window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.CHAT_WIDTH] = width.value;
}

function resizeY(e: PointerEvent) {
  const delta = e.clientY - startY
  height.value = Math.min(
    maxAllowedHeight,
    Math.max(minHeight, startHeight + delta)
  )

  window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.CHAT_HEIGHT] = height.value
}

function resizeXY(e: PointerEvent) {
  resizeX(e)
  resizeY(e)
}

function clampHeightToViewport() {
  maxAllowedHeight = window.innerHeight - CHAT_TOP - BOTTOM_MARGIN;
  height.value = Math.min(height.value, maxAllowedHeight)
}

function resizeEnd() {
  document.removeEventListener('pointermove', resizeX)
  document.removeEventListener('pointermove', resizeY)
  document.removeEventListener('pointermove', resizeXY)
  document.removeEventListener('pointerup', resizeEnd)
}


function autoResizeInput() {
  const el = textarea.value
  if (!el) return

  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

function onChangedWorld(event: { reason: string }) {
  const new_messages = window.ROOM_WORLD.messages.getNew().filter(m => m.author_team !== window.PLAYER.team);
  if (new_messages.length) {
    const messageSound = new Audio('/assets/sounds/message.wav')
    messageSound.volume = window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SOUND_VOLUME]
    messageSound.play();
  }

  let lastWasAtBottom = wasAtBottom.value;

  messages.value = window.ROOM_WORLD.messages.list()
  selectedUnits.value = window.ROOM_WORLD.units.getSelected()
  selectedUnits.value = selectedUnits.value.filter(u => u.type !== unitType.MESSENGER);
  if (isPlayer()) {
    selectedUnits.value = selectedUnits.value.filter(u => u.team === window.PLAYER.team);
  }

  if (
    event.reason === 'select'
    && !isPlayer()
    && selectedUnits.value.length
    && activeTeam.value !== Team.ADMIN
  ) {
    activeTeam.value = selectedUnits.value.length > 0 ? Team.ADMIN : Team.RED;
  }

  // Держмимся низа
  if (lastWasAtBottom) {
    const el = document.querySelector('.chat-messages') as HTMLElement | null
    if (el) {
      nextTick(() => {
        el.scrollTo({ top: el.scrollHeight })
      })
    }
  }

  syncPlayerChatReadState();
}

onMounted(() => {
  clampHeightToViewport()
  window.addEventListener('resize', clampHeightToViewport)
  window.ROOM_WORLD.events.on('changed', onChangedWorld)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', clampHeightToViewport)
  window.ROOM_WORLD.events.off('changed', onChangedWorld)
})

</script>

<template>
  <!-- OPEN BUTTON -->
  <button
    v-if="!isOpen"
    class="chat-open-btn no-select"
    @click="isOpen = true"
  >
    💬
    <span
      v-if="unreadTotal > 0"
      class="chat-open-badge"
    >
    {{ unreadTotal }}
  </span>
  </button>

  <!-- CHAT PANEL -->
  <div
    v-if="isOpen"
    class="krig-chat"
    :style="{ width: width + 'px', height: height + 'px' }"
  >
    <!-- resize handles -->
    <div
      class="resize-handle-x"
      @pointerdown.prevent.stop="resizeXStart"
    />
    <div
      class="resize-handle-y"
      @pointerdown.prevent.stop="resizeYStart"
    />

    <!-- header -->
    <div class="chat-header">
      <div class="chat-tabs">
        <button
          v-for="team in teams"
          :key="team.id"
          class="chat-tab"
          :class="{ active: activeTeam === team.id }"
          @click="onTabClick(team.id)"
        >
          <span
            v-if="team.id === Team.RED"
            class="team-dot red"
          />
          <span
            v-if="team.id === Team.BLUE"
            class="team-dot blue"
          />
          <span class="tab-text" :title="team.label">
            {{ team.label }}
          </span>
          <span
            v-if="unreadByTeam[team.id] > 0"
            class="tab-badge"
          >
            {{ unreadByTeam[team.id] }}
          </span>
        </button>
      </div>
      <button class="close" @click="isOpen = false">✕</button>
    </div>

    <!-- messages -->
    <div class="chat-messages" @scroll="onMessagesScroll">
      <div
        v-for="m in visibleMessages"
        :key="m.id"
        class="chat-message-wrapper"
        :class="{
          unread: isUnreadMessage(m),
          self: isMessageAuthorTeam(m.author_team),
        }"
      >
        <div
          class="chat-message"
        >
          <div class="meta">
            <span class="author" :title="m.author">{{ m.author }}</span>

            <div class="meta-right">
                <span class="datetime" :title="m.time">
                  {{ m.time.split(' ')[1] }}
                </span>

              <!-- Spawn Messenger -->
              <button
                v-if="canSpawnMessenger(m)"
                class="spawn-messenger-btn"
                :title="t('chat.spawn_messenger')"
                @click.stop="onSpawnMessenger(m)"
              >
                📨
              </button>

              <button
                v-if="isUnreadMessage(m) && !isPlayer()"
                class="mark-read-btn"
                :title="t('chat.mark_as_read')"
                @click.stop="onClickMarkAsRead(m.id)"
              >
                ✓
              </button>
            </div>

          </div>
          <div
            v-if="getMessageUnits(m).length"
            class="message-units"
            @click.stop="onUnitsBlockClick(getMessageUnits(m))"
          >
            <div
              v-for="u in getMessageUnits(m)"
              :key="u.id"
              class="unit-card"
            >
              <div class="unit-name">
                {{ u.label ?? `#${u}` }}
              </div>
            </div>
          </div>
          <div class="text">
            {{ m.text }}
          </div>
        </div>
      </div>
    </div>

    <!-- input -->
    <template v-if="!isEnd()">
      <template v-if="!getSendWarningMessage()">
        <form class="chat-input" @submit.prevent="send">
      <textarea
        ref="textarea"
        v-model="input"
        rows="1"
        :placeholder="t('chat.input_placeholder')"
        @keydown.enter.exact.prevent="send"
        @keydown.enter.shift.stop
        @input="autoResizeInput"
        @keydown.stop
      />
          <button type="submit">➤</button>
        </form>
      </template>
      <template v-else>
        <div class="chat-selection-warning">
          <div class="warning-icon">⚠️</div>
          <div class="warning-text">
            <div class="title">
              {{ t('chat.selection_warning') }}
            </div>
            <div class="hint">
              {{ getSendWarningMessage() }}
            </div>
          </div>
        </div>
      </template>
    </template>

    <div
      class="resize-handle-xy"
      @pointerdown.prevent.stop="resizeXYStart"
    >
      <span />
    </div>

    <div
      v-if="unreadInActiveTab > 0"
      class="new-messages-float"
      @click="isPlayer() ? onClickMarkAllAsRead() : scrollToFirstUnread()"
    >
      <template v-if="isPlayer()">
        {{ t('chat.mark_all_as_read') }}
      </template>
      <template v-else>
        {{ t('chat.first_unread') }}
      </template>
    </div>
  </div>
</template>

<style scoped>
/* open button */
.chat-open-btn {
  position: absolute;
  top: 76px;
  right: 18px;
  transform: translateY(-50%);
  pointer-events: auto;

  padding: 10px;
  border-radius: 50%;
  border: 1px solid #334155;
  background: #020617cc;
  color: white;
  cursor: pointer;
}

/* panel */
.krig-chat {
  position: absolute;
  top: 62px;
  right: 16px;

  display: flex;
  flex-direction: column;

  background: #020617cc;
  border: 1px solid #334155;
  border-radius: 12px;

  pointer-events: auto;

  border-bottom-left-radius: 0;

  z-index: 10;
}

/* resize handles */
.resize-handle-x {
  position: absolute;
  left: -12px;
  top: 0;
  bottom: 12px;
  width: 12px;
  cursor: ew-resize;
}

.resize-handle-y {
  position: absolute;
  left: 12px;
  right: 0;
  bottom: -6px;
  height: 12px;
  cursor: ns-resize;
}

/* header */
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid #334155;
  font-weight: 600;
}

.chat-header .close {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
}

/* messages */
.chat-messages {
  flex: 1;
  padding: 10px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

.chat-message {
  width: 90%;
  padding: 6px 8px;
  border-radius: 8px;
  background: #020617;
  border: 1px solid #334155;
}

.chat-message .author {
  max-width: 50%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.chat-message-wrapper {
  width: 100%;
  display: flex;
  padding: 6px 0;
}

.chat-message-wrapper.unread {
  position: relative;
  background: color-mix(in srgb, var(--accent) 20%, transparent);
}


.chat-message-wrapper.self {
  justify-content: flex-end;
}

.self .chat-message {
  background: var(--accent-hover);
  color: #020617;
}

.meta {
  display: flex;
  align-items: center;
  font-size: 11px;
  opacity: 0.7;
}

.meta-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.text {
  margin-top: 5px;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}

/* input */
.chat-input {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid #334155;
}

.chat-input textarea {
  flex: 1;
  resize: none;
  overflow: hidden;

  background: #020617;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px 8px;

  color: white;
  font-size: 13px;
  line-height: 1.4;

  max-height: 120px;
}

.chat-input button {
  background: var(--accent);
  border: none;
  border-radius: 8px;
  padding: 0 12px;
}

.resize-handle-xy {
  height: 24px;
  width: 24px;

  position: absolute;
  left: -12px;
  bottom: -12px;
  cursor: nesw-resize;
}

.resize-handle-xy::before {
  content: '';
  position: absolute;
  left: 15px;
  bottom: 15px;

  width: 1px;
  height: 10px;

  background: white;
}

.resize-handle-xy::after {
  content: '';
  position: absolute;
  left: 15px;
  bottom: 15px;

  width: 10px;
  height: 1px;

  background: white;
}

.resize-handle-xy span {
  position: absolute;
  left: 6px;
  bottom: 6px;

  width: 1px;
  height: 7px;

  background: rgba(255, 255, 255, 0.5);
}

.resize-handle-xy span::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;

  width: 7px;
  height: 1px;

  background: rgba(255, 255, 255, 0.5);
}

.chat-tabs {
  display: flex;
  gap: 4px;
  padding: 6px;
  border-bottom: 1px solid #334155;
}

.chat-tab {
  display: flex;
  align-items: center;
  gap: 6px;

  max-width: 150px;
  padding: 4px 10px;

  background: #020617;
  border: 1px solid #334155;
  border-radius: 6px;

  cursor: pointer;
}

.chat-tab.active {
  background: var(--accent);
  color: #020617;
}


.tab-text {
  color: var(--text);
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  flex: 1;
}

.team-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.team-dot.red {
  background: #ef4444;
}

.team-dot.blue {
  background: #3b82f6;
}

/* UNREAD */

.chat-message.unread {
  background: #020617;
  border-left: 3px solid var(--accent);
}

.chat-message.unread:not(.self) {
  background: rgba(56, 189, 248, 0.08);
}

.tab-badge {
  margin-left: auto;
  background: #ef4444;
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
}

.new-messages-float {
  text-align: center;

  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);

  background: var(--accent);
  color: #020617;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,.3);
}

.chat-open-badge {
  position: absolute;
  top: -4px;
  right: -4px;

  min-width: 18px;
  height: 18px;
  padding: 0 5px;

  background: #ef4444;
  color: white;
  font-size: 11px;
  font-weight: 700;

  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;

  pointer-events: none;
}

.mark-read-btn {
  margin-left: 8px;
  background: transparent;
  border: 1px solid var(--accent);
  color: var(--accent);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  cursor: pointer;
  line-height: 1;
}

.mark-read-btn:hover {
  background: var(--accent);
  color: #020617;
}

.datetime {
  white-space: nowrap;
}

/* SELECTION WARNING */
.chat-selection-warning {
  margin: 16px;
  padding: 14px 16px;

  display: flex;
  align-items: center;
  gap: 12px;

  border: 1px dashed rgba(255, 255, 255, 0.25);
  border-radius: 10px;

  background: rgba(15, 23, 42, 0.6);
  color: #e5e7eb;

  font-size: 13px;
}

.warning-icon {
  font-size: 22px;
  line-height: 1;
  opacity: 0.9;
}

.warning-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.warning-text .title {
  font-weight: 600;
  color: var(--accent);
}

.warning-text .hint {
  font-size: 12px;
  opacity: 0.8;
}

/* Unit cards */
.message-units {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  cursor: pointer;
}

.unit-card {
  padding: 2px 4px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid #334155;
  font-size: 11px;
  min-width: 50px;
  color: #dbdbdb;
}

.unit-name {
  font-weight: 600;
  white-space: nowrap;
}

.spawn-messenger-btn {
  background: transparent;
  border: 1px solid #38bdf8;
  color: #38bdf8;
  background: black;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  cursor: pointer;
  line-height: 1;
}

.spawn-messenger-btn:hover {
  background: #38bdf8;
  color: #020617;
}


</style>
