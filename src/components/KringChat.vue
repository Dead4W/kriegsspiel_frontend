<script setup lang="ts">
import {computed, type ComputedRef, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'

import {useI18n} from 'vue-i18n'
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";
import {Team} from "@/enums/teamKeys.ts";
import {type ChatMessage, ChatMessageStatus} from "@/engine/types/chatMessage.ts";
import {BaseUnit} from "@/engine/units/baseUnit.ts";
import {type unitstate, unitType, type uuid} from "@/engine";
import {RoomGameStage} from "@/enums/roomStage.ts";
import {Messenger} from "@/engine/units/messenger.ts";
import {DeliveryCommand} from "@/engine/units/commands/deliveryCommand.ts";
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys.ts";
import {getTeamColor} from "@/engine/2d/render/util.ts";
import type {OverlayItem} from "@/engine/types/overlayTypes.ts";
import KringChatMessage from "@/components/chat/KringChatMessage.vue";
import {
  autoSpawnMessengerForIncomingOrder,
  findHighestHpUnit,
  findLastNonAdminAuthorTeam,
  findTeamGeneral,
  getCurrentMessengerRouteFromGeneral,
  getCurrentPlayerGeneral,
  getMessengerSpawnPosition,
  spawnMessengerForMessage,
} from "@/engine/units/messengerChatLogic.ts";

const { t } = useI18n()
const props = withDefaults(
  defineProps<{
    is3dMode?: boolean
  }>(),
  {
    is3dMode: false,
  }
)


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

function isPlayerRoomMap() {
  return !!window.ROOM_SETTINGS[ROOM_SETTING_KEYS.IS_PLAYER_ROOM_MAP]
}

function isOwnMessage(m: ChatMessage) {
  if (window.PLAYER.team === Team.SPECTATOR) {
    return m.author_team === Team.ADMIN;
  }

  if (isPlayer() && isPlayerRoomMap()) {
    if (m.author_id != null && window.PLAYER.id != null) {
      return m.author_id === window.PLAYER.id;
    }

    return m.author_team === window.PLAYER.team && m.author === window.PLAYER.name;
  }

  return m.author_team === window.PLAYER.team;
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
    return !isOwnMessage(m) && m.status !== ChatMessageStatus.Read
  } else {
    return !isOwnMessage(m) && m.delivered && m.status !== ChatMessageStatus.Read
  }
}

function canSpawnMessenger(): boolean {
  return window.PLAYER.team === Team.ADMIN
}

function onSpawnMessenger(m: ChatMessage) {
  if (props.is3dMode) return
  spawnMessengerForMessage(m, selectedUnits.value, t(`unit.${unitType.MESSENGER}`))
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

function isWarStage(): boolean {
  return window.ROOM_WORLD.stage === RoomGameStage.WAR
}

function getSendWarningMessage() {
  if (isEditing.value) {
    return null;
  }

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
}

function onUnitsBlockClick(units: BaseUnit[]) {
  if (props.is3dMode) return
  const w = window.ROOM_WORLD

  w.units.clearSelection()
  for (const u of units) {
    u.selected = true
  }

  focusUnits(units)
  w.events.emit('changed', { reason: 'unit-selected' })
}

function getCurrentPlayerAvatar(): string | null {
  const player = window.PLAYER as unknown as {
    avatar_url?: string | null
    picture?: string | null
    avatar?: string | null
  }
  const rawAvatar = player.avatar_url ?? player.picture ?? player.avatar ?? null
  if (typeof rawAvatar !== 'string') {
    return null
  }
  const avatar = rawAvatar.trim()
  return avatar.length ? avatar : null
}

/* =======================
   STATES
======================= */

const isOpen = ref(false)

const width = ref(window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.CHAT_WIDTH] ?? 320)
const height = ref(window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.CHAT_HEIGHT] ?? 420)
const textSize = ref(Number(window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.CHAT_TEXT_SIZE] ?? 15))

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

function parseTimestamp(value?: string | null): number {
  if (!value) return 0
  const normalized = value.replace(' ', 'T')
  const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalized)
  const ts = new Date(hasTimezone ? normalized : `${normalized}Z`).getTime()
  return Number.isNaN(ts) ? 0 : ts
}

function isPlayableTeam(team: Team): boolean {
  return team === Team.RED || team === Team.BLUE
}

function shouldUseCreatedAtTimestamp(message: ChatMessage): boolean {
  return isPlayableTeam(activeTeam.value) && message.author_team === activeTeam.value
}

function getMessageOrderTimestamp(message: ChatMessage): number {
  if (shouldUseCreatedAtTimestamp(message)) {
    return parseTimestamp(message.created_at) || parseTimestamp(message.time)
  }
  return parseTimestamp(message.delivered_at)
    || parseTimestamp(message.created_at)
    || parseTimestamp(message.time)
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

    // сортировка по реальному времени отправки/доставки
    result.sort((a, b) => getMessageOrderTimestamp(a) - getMessageOrderTimestamp(b))

    return result
  }

  // обычные чаты
  return messages.value
    .filter(m => m.time <= window.ROOM_WORLD.time)
    .filter(m => m.team === activeTeam.value)
    .sort((a, b) => getMessageOrderTimestamp(a) - getMessageOrderTimestamp(b))
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
const editingMessageId = ref<uuid | null>(null)
const isEditing = computed(() => editingMessageId.value !== null)
const quotedMessageId = ref<uuid | null>(null)
const highlightedMessageId = ref<uuid | null>(null)
let highlightTimeout: ReturnType<typeof setTimeout> | null = null
const routePoints = ref<Array<{ x: number; y: number }>>([])

function isRouteCaptureActive(): boolean {
  return (
    isOpen.value
    && isPlayer()
    && isWarStage()
    && selectedUnits.value.length > 0
    && input.value.trim().length > 0
  )
}

function canEditMessage(message: ChatMessage): boolean {
  return isOwnMessage(message)
    && message.time === window.ROOM_WORLD.time
}

function startEditMessage(message: ChatMessage) {
  if (!canEditMessage(message)) return
  editingMessageId.value = message.id
  input.value = message.text
  nextTick(() => {
    autoResizeInput()
    textarea.value?.focus()
  })
}

function cancelEditMessage() {
  editingMessageId.value = null
  input.value = ''
  nextTick(() => autoResizeInput())
}

function insertAtCursor(value: string) {
  const el = textarea.value
  if (!el) {
    input.value += value
    return
  }

  const start = el.selectionStart
  const end = el.selectionEnd
  input.value = input.value.slice(0, start) + value + input.value.slice(end)

  nextTick(() => {
    const pos = start + value.length
    el.focus()
    el.setSelectionRange(pos, pos)
    autoResizeInput()
  })
}

function wrapSelection(prefix: string, suffix = prefix) {
  const el = textarea.value
  if (!el) return

  const start = el.selectionStart
  const end = el.selectionEnd
  const selected = input.value.slice(start, end)
  const wrapped = `${prefix}${selected || 'text'}${suffix}`

  input.value = input.value.slice(0, start) + wrapped + input.value.slice(end)

  nextTick(() => {
    const pos = start + wrapped.length
    el.focus()
    el.setSelectionRange(pos, pos)
    autoResizeInput()
  })
}

function insertMarkdownLink() {
  insertAtCursor('[text](https://example.com)')
}

function insertMarkdownImage() {
  insertAtCursor('![image](https://example.com/image.png)')
}

function insertMarkdownList() {
  insertAtCursor('- ')
}

function isImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false
    }
    return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url.pathname + url.search)
  } catch {
    return false
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}

async function onInputPaste(event: ClipboardEvent) {
  const clipboardData = event.clipboardData
  if (!clipboardData) return

  const pastedText = clipboardData.getData('text/plain')?.trim()
  if (pastedText && isImageUrl(pastedText)) {
    event.preventDefault()
    insertAtCursor(`![image](${pastedText})`)
    return
  }

  const imageFiles = Array.from(clipboardData.items)
    .filter(item => item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter((file): file is File => Boolean(file))

  if (!imageFiles.length) return

  event.preventDefault()

  const markdownImages = await Promise.all(imageFiles.map(async (file) => {
    const src = await fileToDataUrl(file)
    const fileName = file.name || 'image'
    return `![${fileName}](${src})`
  }))

  insertAtCursor(markdownImages.join('\n'))
}

function onInputEscape() {
  textarea.value?.blur()
}

function send() {
  if (!input.value.trim()) return

  if (editingMessageId.value) {
    const message = window.ROOM_WORLD.messages.get(editingMessageId.value)
    if (!message || !canEditMessage(message)) {
      cancelEditMessage()
      return
    }

    message.text = input.value
    window.ROOM_WORLD.events.emit('api', {
      type: 'chat_edit',
      data: {
        id: message.id,
        text: message.text,
      },
    })
    window.ROOM_WORLD.events.emit('changed', { reason: 'chat_edit' })
    cancelEditMessage()
    nextTick(() => {
      scrollDown()
    })
    return
  }

  const selected = window.ROOM_WORLD.units.getSelected()
    .filter(u => u.type !== unitType.MESSENGER)

  if (!selected.length) return

  const warning = getSendWarningMessage()
  if (warning) return

  const baseTeam = selected[0]!.team as Team;
  const inferredReportTeam = (
    window.PLAYER.team === Team.ADMIN
    && isWarStage()
    && !selected.some((u) => u.type === unitType.GENERAL)
  )
    ? findLastNonAdminAuthorTeam(selected.map((u) => u.id))
    : null
  const team = inferredReportTeam ?? baseTeam
  const general = selected.find((u) => u.type === unitType.GENERAL) ?? findTeamGeneral(team)
  const routePayload = getCurrentMessengerRouteFromGeneral(general, selected, routePoints.value)
  const m = {
    id: crypto.randomUUID(),
    author: window.PLAYER.name,
    author_id: window.PLAYER.id,
    author_avatar: getCurrentPlayerAvatar(),
    author_team: window.PLAYER.team,
    unitIds: selected.map(u => u.id),
    text: input.value,
    time: window.ROOM_WORLD.time,
    created_at: new Date().toISOString(),
    delivered_at: null,
    quotedMessageId: quotedMessageId.value,
    deliveryStatus: 'pending',
    routePoints: routePayload.route,
    team: team,
    status: ChatMessageStatus.Sent,
    delivered: false,
  } as ChatMessage;

  window.ROOM_WORLD.addMessage(m);

  for (const u of selected) {
    u.linkMessage(m.id);
    u.setDirty()
  }

  const selectedGeneral = selected.find((u) => u.type === unitType.GENERAL) ?? null

  const shouldAutoSpawnAdminWithGeneral = (
    isWarStage()
    && window.PLAYER.team === Team.ADMIN
    && (team === Team.RED || team === Team.BLUE)
    && selectedGeneral != null
  )

  const shouldAutoSpawnAdminReport = (
    isWarStage()
    && window.PLAYER.team === Team.ADMIN
    && !selected.some((u) => u.type === unitType.GENERAL)
    && (team === Team.RED || team === Team.BLUE)
  )
  if (shouldAutoSpawnAdminWithGeneral || shouldAutoSpawnAdminReport) {
    const targetTeam = team
    const targetGeneral = findTeamGeneral(targetTeam)
    if (!targetGeneral) {
      input.value = ''
      clearQuote()
      clearRoute()
      return
    }
    const sourceUnit = shouldAutoSpawnAdminWithGeneral
      ? selectedGeneral
      : (findHighestHpUnit(selected) ?? targetGeneral)
    const spawnPos = shouldAutoSpawnAdminWithGeneral
      ? { x: sourceUnit.pos.x, y: sourceUnit.pos.y }
      : getMessengerSpawnPosition({ x: sourceUnit.pos.x, y: sourceUnit.pos.y }, m.team, 1000)
    const messengerTeam = targetTeam === Team.RED ? 'red' : 'blue'
    const messengerState: unitstate = {
      id: crypto.randomUUID(),
      type: unitType.MESSENGER,
      team: messengerTeam,
      pos: spawnPos,
      label: 'GENERATED GENERAL MESSENGER',
      messagesLinked: [{id: m.id, time: window.ROOM_WORLD.time}],
    }
    const messenger = new Messenger(messengerState);
    const selectedGeneralTargets = selected
      .filter((u) => u.type === unitType.GENERAL)
      .map((u) => u.id)
    const cmd = new DeliveryCommand({
      targets: shouldAutoSpawnAdminWithGeneral ? selectedGeneralTargets : [targetGeneral.id],
      instantDelivery: shouldAutoSpawnAdminWithGeneral,
      messageId: m.id,
      messengerId: messengerState.id,
      quotedMessageId: m.quotedMessageId ?? null,
      sourceUnitId: sourceUnit.id,
      manualRoutePoints: shouldAutoSpawnAdminWithGeneral ? [] : routePayload.route,
      manualRouteIsPath: !shouldAutoSpawnAdminWithGeneral,
      deliveryStatus: 'pending',
    })
    messenger.addCommand(cmd.getState())
    window.ROOM_WORLD.addUnits([messenger.toState()]);
  }

  input.value = ''
  clearQuote()
  clearRoute()

  nextTick(() => {
    autoResizeInput()
    scrollDown()
  })
}

function clearRoute() {
  routePoints.value = []
  window.ROOM_WORLD.clearOverlay()
}

function setQuote(messageId: uuid | null) {
  quotedMessageId.value = messageId
}

function clearQuote() {
  quotedMessageId.value = null
}

const quotedMessage = computed(() => {
  if (!quotedMessageId.value) return null
  return window.ROOM_WORLD.messages.get(quotedMessageId.value) ?? null
})

function focusQuotedMessage(messageId?: uuid | null) {
  if (!messageId) return
  const messageEl = document.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null
  highlightedMessageId.value = messageId
  if (highlightTimeout !== null) {
    clearTimeout(highlightTimeout)
  }
  highlightTimeout = setTimeout(() => {
    if (highlightedMessageId.value === messageId) {
      highlightedMessageId.value = null
    }
    highlightTimeout = null
  }, 3000)
  messageEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function redrawRoutePreview() {
  const general = getCurrentPlayerGeneral()
  if (!general || !isRouteCaptureActive() || !isWarStage()) {
    window.ROOM_WORLD.clearOverlay()
    return
  }

  const { route: manualRoute } = getCurrentMessengerRouteFromGeneral(general, selectedUnits.value, routePoints.value)
  const route: Array<{ x: number; y: number }> = [...manualRoute]

  if (!route.length) {
    window.ROOM_WORLD.clearOverlay()
    return
  }

  const opacity = Number(window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.OPACITY_COMMANDS] ?? 0.8)
  const { r, g, b } = getTeamColor(general.team)
  const color = `rgba(${r},${g},${b},${opacity})`
  const overlay: OverlayItem[] = []
  let prev = { x: general.pos.x, y: general.pos.y }
  for (const point of route) {
    overlay.push({
      type: 'line',
      from: prev,
      to: point,
      color,
      width: 6,
      dash: [6, 6],
      dashOffset: -1,
    })
    prev = point
  }
  window.ROOM_WORLD.setOverlay(overlay)
}

function onGlobalPointerDown(event: PointerEvent) {
  if (!isRouteCaptureActive() || !isPlayer() || !isWarStage()) return
  const target = event.target as HTMLElement | null
  if (target && target.closest('.krig-chat')) return
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  const worldPos = window.ROOM_WORLD.camera.screenToWorld({
    x: event.clientX,
    y: event.clientY,
  })
  routePoints.value.push({
    x: worldPos.x,
    y: worldPos.y,
  })
  redrawRoutePreview()
}

function scrollDown() {
  const el = document.querySelector('.chat-messages')
  el?.scrollTo({ top: el.scrollHeight })
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
    const originMessage = window.ROOM_WORLD.messages.get(message.id)!;
    originMessage.status = ChatMessageStatus.Read;
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
  if (!open) {
    clearRoute()
    return
  }

  await nextTick()
  scrollToFirstUnread()
})

watch(routePoints, () => {
  redrawRoutePreview()
}, { deep: true })

watch(() => input.value.trim().length > 0, (hasInput) => {
  if (!hasInput && routePoints.value.length > 0) {
    clearRoute()
    return
  }
  redrawRoutePreview()
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
  textSize.value = Number(window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.CHAT_TEXT_SIZE] ?? 15)

  // Проверяем новые сообщения только на финальном сокет-ивенте,
  // чтобы пачка сообщений из одного ws-пакета давала одно уведомление.
  if (event.reason === 'ws') {
    const new_messages = window.ROOM_WORLD.messages.getNew().filter(m => !isOwnMessage(m));
    if (new_messages.length) {
      for (const message of new_messages) {
        autoSpawnMessengerForIncomingOrder(message)
      }
      const messageSound = new Audio('/assets/sounds/new_message.ogg')
      messageSound.volume = window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SOUND_VOLUME]
      messageSound.play().catch(() => {})
    }
  }

  const lastWasAtBottom = wasAtBottom.value;

  messages.value = window.ROOM_WORLD.messages.list()
  if (editingMessageId.value) {
    const editingMessage = window.ROOM_WORLD.messages.get(editingMessageId.value)
    if (!editingMessage || !canEditMessage(editingMessage)) {
      cancelEditMessage()
    }
  }
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
  window.addEventListener('pointerdown', onGlobalPointerDown, true)
  window.ROOM_WORLD.events.on('changed', onChangedWorld)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', clampHeightToViewport)
  window.removeEventListener('pointerdown', onGlobalPointerDown, true)
  window.ROOM_WORLD.events.off('changed', onChangedWorld)
  clearRoute()
  if (highlightTimeout !== null) {
    clearTimeout(highlightTimeout)
    highlightTimeout = null
  }
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
    :style="{
      width: width + 'px',
      height: height + 'px',
      '--chat-text-size': textSize + 'px',
    }"
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
      <KringChatMessage
        v-for="m in visibleMessages"
        :key="m.id"
        :message="m"
        :active-team="activeTeam"
        :is-own="isOwnMessage(m)"
        :is-unread="isUnreadMessage(m)"
        :highlighted="highlightedMessageId === m.id"
        :can-spawn-messenger="canSpawnMessenger()"
        :can-edit="canEditMessage(m)"
        :is-player="isPlayer()"
        @spawn-messenger="onSpawnMessenger"
        @edit-message="startEditMessage"
        @quote-message="setQuote"
        @mark-as-read="onClickMarkAsRead"
        @focus-quoted-message="focusQuotedMessage"
        @focus-units="onUnitsBlockClick"
      />
    </div>

    <!-- input -->
    <template v-if="!isEnd()">
      <template v-if="!getSendWarningMessage()">
        <form class="chat-input" @submit.prevent="send">
          <div v-if="quotedMessage" class="chat-quote-banner">
            <span>{{ t('chat.quoting') }}: {{ quotedMessage.author }}</span>
            <button type="button" @click="clearQuote">{{ t('chat.cancel') }}</button>
          </div>

          <div v-if="isPlayer() && isWarStage()" class="chat-route-toolbar">
            <span class="chat-route-toolbar-hint">
              {{ t('chat.route.auto_capture_hint') }}
            </span>
            <button v-if="routePoints.length > 0" type="button" @click="clearRoute">
              {{ t('chat.route.clear') }}
            </button>
            <span>{{ t('chat.route.points_count', { count: routePoints.length }) }}</span>
          </div>

          <div v-if="isEditing" class="chat-editing-banner">
            <span>{{ t('chat.editing') }}</span>
            <button type="button" @click="cancelEditMessage">
              {{ t('chat.cancel') }}
            </button>
          </div>

          <div class="chat-md-tools">
            <button type="button" :title="t('chat.markdown.bold')" @click="wrapSelection('**')"><b>B</b></button>
            <button type="button" :title="t('chat.markdown.italic')" @click="wrapSelection('*')"><i>I</i></button>
            <button type="button" :title="t('chat.markdown.code')" @click="wrapSelection('`')">Code</button>
            <button type="button" :title="t('chat.markdown.link')" @click="insertMarkdownLink">Link</button>
            <button type="button" :title="t('chat.markdown.image')" @click="insertMarkdownImage">Image</button>
            <button type="button" :title="t('chat.markdown.list')" @click="insertMarkdownList">List</button>
          </div>
          <div class="chat-input-main">
            <textarea
              ref="textarea"
              v-model="input"
              rows="1"
              :placeholder="t('chat.input_placeholder')"
              :title="t('chat.markdown.input_hint')"
              @keydown.enter.exact.prevent="send"
              @keydown.enter.shift.stop
              @keydown.esc.stop.prevent="onInputEscape"
              @input="autoResizeInput"
              @paste="onInputPaste"
              @keydown.stop.exact
            />
            <button type="submit" :title="isEditing ? t('chat.save') : t('chat.send')">
              {{ isEditing ? '✓' : '➤' }}
            </button>
          </div>
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

.chat-open-btn:hover {
  background: #020617cc;
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

/* input */
.chat-input {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid #334155;
}

.chat-editing-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #e2e8f0;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px 8px;
}

.chat-editing-banner button {
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 6px;
  color: #f1f5f9;
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
}

.chat-editing-banner button:hover {
  background: #334155;
}

.chat-input-main {
  display: flex;
  gap: 6px;
}

.chat-md-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chat-md-tools button {
  background: #0f172a;
  color: var(--text);
  border: 1px solid #334155;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1;
  padding: 4px 8px;
}

.chat-md-tools button:hover {
  border-color: #475569;
}

.chat-input textarea {
  flex: 1;
  resize: none;
  overflow: auto;

  background: #020617;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px 8px;

  color: white;
  font-size: 13px;
  line-height: 1.4;

  max-height: 120px;
}

.chat-input-main > button[type='submit'] {
  background: var(--accent);
  border: none;
  border-radius: 8px;
  width: 44px;
  height: 34px;
  flex-shrink: 0;
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


.chat-quote-banner,
.chat-route-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 11px;
  color: #cbd5e1;
}

.chat-route-toolbar button,
.chat-quote-banner button {
  background: #1e293b;
  border: 1px solid #475569;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 2px 8px;
  cursor: pointer;
}

.chat-route-toolbar-hint {
  flex: 1;
  opacity: 0.9;
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

</style>
