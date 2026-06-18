<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {marked} from 'marked'
import DOMPurify from 'dompurify'
import IdenticonAvatar from "@/components/ui/IdenticonAvatar.vue";
import {type ChatMessage} from "@/engine/types/chatMessage.ts";
import {BaseUnit} from "@/engine/units/baseUnit.ts";
import {Team} from "@/enums/teamKeys.ts";
import {type uuid} from "@/engine";

const props = defineProps<{
  message: ChatMessage
  activeTeam: Team
  isOwn: boolean
  isUnread: boolean
  highlighted: boolean
  canSpawnMessenger: boolean
  canEdit: boolean
  isPlayer: boolean
}>()

const emit = defineEmits<{
  (e: 'spawnMessenger', message: ChatMessage): void
  (e: 'editMessage', message: ChatMessage): void
  (e: 'quoteMessage', messageId: uuid): void
  (e: 'markAsRead', messageId: uuid): void
  (e: 'focusQuotedMessage', messageId: uuid): void
  (e: 'focusUnits', units: BaseUnit[]): void
}>()

const {t, te} = useI18n()
const brokenAuthorAvatar = ref(false)

function resolveUnitsByIds(ids: uuid[]): Array<BaseUnit | uuid> {
  if (!ids.length) return []
  return ids.map((id) => window.ROOM_WORLD.units.get(id)! ?? id)
}

function extractUnitTagIds(text: string): uuid[] {
  const result: uuid[] = []
  const seen = new Set<uuid>()
  const regex = /#unit\.([a-zA-Z0-9-]+)#/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const id = match[1] as uuid
    if (seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

function stripUnitTagsInLine(text: string): string {
  return text
    .replace(/#unit\.[a-zA-Z0-9-]+#/g, '')
    .replace(/\s{2,}/g, ' ')
    .trimEnd()
}

function resolveChatMessageText(text: string): string {
  const i18nPrefix = '#i18n.'
  const lines = text.split('\n')
  let changed = false
  const resolvedLines = lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith(i18nPrefix)) return line
    const keyAndTail = trimmed.slice(i18nPrefix.length)
    const spaceIdx = keyAndTail.indexOf(' ')
    const key = spaceIdx >= 0 ? keyAndTail.slice(0, spaceIdx) : keyAndTail
    const tail = spaceIdx >= 0 ? keyAndTail.slice(spaceIdx) : ''
    if (!key) return line
    changed = true
    return `${te(key) ? t(key) : key}${tail}`
  })
  return changed ? resolvedLines.join('\n') : text
}

function getMessageUnitTitle(u: BaseUnit | uuid): string {
  if (u instanceof BaseUnit) {
    return u.label
  }
  const fallbackTitle = props.message.unitFallbackTitles?.[u]
  if (fallbackTitle) {
    return fallbackTitle
  }
  return `#${u}`
}

function isFallbackUnitTitle(u: BaseUnit | uuid): boolean {
  if (u instanceof BaseUnit) {
    return false
  }
  return !!props.message.unitFallbackTitles?.[u]
}

function isPlayableTeam(team: Team): boolean {
  return team === Team.RED || team === Team.BLUE
}

function shouldUseCreatedAtTimestamp(message: ChatMessage): boolean {
  return isPlayableTeam(props.activeTeam) && message.author_team === props.activeTeam
}

const displayTimestamp = computed(() => {
  if (shouldUseCreatedAtTimestamp(props.message)) {
    return props.message.created_at ?? props.message.time
  }
  return props.message.time
})

const displayTime = computed(() => {
  const value = displayTimestamp.value
  const normalized = value.replace(' ', 'T')
  const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalized)
  const date = new Date(hasTimezone ? normalized : `${normalized}Z`)
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString(
      [localStorage.getItem('i18n_locale') ?? 'en'],
      {hour: '2-digit', minute: '2-digit', second: '2-digit'},
    )
  }
  const timePart = value.split(' ')[1]
  return timePart ?? value
})

function renderMarkdown(text: string): string {
  const html = marked.parse(text, {
    breaks: true,
    gfm: true,
  }) as string
  const sanitized = DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel', 'loading', 'decoding', 'referrerpolicy'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:https?|mailto|tel|blob):|data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,)|[^a-z]|[a-z+.\-.]+(?:[^a-z+.\-:]|$))/i,
  })
  const doc = new DOMParser().parseFromString(sanitized, 'text/html')
  doc.querySelectorAll('a').forEach((link) => {
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer nofollow')
  })
  doc.querySelectorAll('img').forEach((image) => {
    image.setAttribute('loading', 'lazy')
    image.setAttribute('decoding', 'async')
    image.setAttribute('referrerpolicy', 'no-referrer')
  })
  return doc.body.innerHTML
}

function renderMarkdownInline(text: string): string {
  const html = marked.parseInline(text, {gfm: true}) as string
  const sanitized = DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:https?|mailto|tel|blob):|data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,)|[^a-z]|[a-z+.\-.]+(?:[^a-z+.\-:]|$))/i,
  })
  const doc = new DOMParser().parseFromString(sanitized, 'text/html')
  doc.querySelectorAll('a').forEach((link) => {
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer nofollow')
  })
  return doc.body.innerHTML
}

function getAuthorAvatar(): string | null {
  if (typeof props.message.author_avatar !== 'string') {
    return null
  }
  const avatar = props.message.author_avatar.trim()
  return avatar.length ? avatar : null
}

const hasVisibleAuthorAvatar = computed(() => {
  const avatar = getAuthorAvatar()
  return !!avatar && !brokenAuthorAvatar.value
})

const messageUnits = computed(() => resolveUnitsByIds(props.message.unitIds ?? []))
const hasMessageUnitTags = computed(() => extractUnitTagIds(props.message.text).length > 0)
const resolvedMessageText = computed(() => resolveChatMessageText(props.message.text))

type MessageUnitTagLine = {
  text: string
  units: Array<BaseUnit | uuid>
}

const messageUnitTagLines = computed<MessageUnitTagLine[]>(() => {
  return resolvedMessageText.value
    .split('\n')
    .map((line) => {
      const ids = extractUnitTagIds(line)
      return {
        text: stripUnitTagsInLine(line),
        units: resolveUnitsByIds(ids),
      }
    })
})

const quotedMessage = computed(() => {
  if (!props.message.quotedMessageId) return null
  return window.ROOM_WORLD.messages.get(props.message.quotedMessageId) ?? null
})

const quotedMessageAuthor = computed(() => {
  if (quotedMessage.value) return quotedMessage.value.author
  if (props.message.quotedMessageId) return `#${props.message.quotedMessageId.slice(0, 8)}`
  return ''
})

const quotedMessagePreview = computed(() => {
  if (!quotedMessage.value) return ''
  return resolveChatMessageText(quotedMessage.value.text)
    .split('\n')
    .map((line) => stripUnitTagsInLine(line).trim())
    .filter((line) => line.length > 0)
    .join(' ')
})

function onUnitsBlockClick(units: Array<BaseUnit | uuid>) {
  const resolved = units.filter((u): u is BaseUnit => u instanceof BaseUnit)
  if (!resolved.length) return
  emit('focusUnits', resolved)
}

const orderPreview = computed(() => {
  const orders = props.message.orders
  if (!orders || !Array.isArray(orders.perUnit) || !orders.perUnit.length) return []
  return orders.perUnit.map((item) => {
    const unit = window.ROOM_WORLD.units.get(item.unitId)
    const unitLabel = unit?.label || item.unitLabel || item.unitId
    const commandNames = (item.commands || [])
      .map((command) => {
        const rawType = (command as { type?: unknown }).type
        return typeof rawType === 'string' ? rawType : null
      })
      .filter((value): value is string => Boolean(value))
    return {
      unitId: item.unitId,
      unitLabel,
      commandNames,
    }
  })
})

const canShowOrders = computed(() => {
  if (!props.message.orders) return false
  if (props.message.delivered) return true
  return props.message.deliveryStatus === 'delivered'
})
</script>

<template>
  <div
    :data-message-id="message.id"
    class="chat-message-wrapper"
    :class="{ unread: isUnread, self: isOwn, highlighted: highlighted }"
  >
    <div class="chat-message">
      <div class="meta">
        <div class="author-block">
          <div class="author-avatar">
            <img
              v-if="hasVisibleAuthorAvatar"
              :src="getAuthorAvatar()!"
              :alt="message.author"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              @error="brokenAuthorAvatar = true"
            >
            <span v-else class="author-avatar-fallback">
              <IdenticonAvatar :value="message.author" :size="28" />
            </span>
          </div>
          <span class="author" :title="message.author">{{ message.author }}</span>
        </div>

        <div class="meta-right">
          <span class="datetime" :title="displayTimestamp">
            {{ displayTime }}
          </span>

          <button
            v-if="canSpawnMessenger"
            class="spawn-messenger-btn"
            :title="t('chat.spawn_messenger')"
            @click.stop="emit('spawnMessenger', message)"
          >
            📨
          </button>

          <button
            v-if="canEdit"
            class="edit-message-btn"
            :title="t('chat.edit')"
            @click.stop="emit('editMessage', message)"
          >
            ✎
          </button>

          <button
            class="quote-message-btn"
            :title="t('chat.quote')"
            @click.stop="emit('quoteMessage', message.id)"
          >
            "
          </button>

          <button
            v-if="isUnread && !isPlayer"
            class="mark-read-btn"
            :title="t('chat.mark_as_read')"
            @click.stop="emit('markAsRead', message.id)"
          >
            ✓
          </button>
        </div>
      </div>

      <div
        v-if="messageUnits.length"
        class="message-units"
        @click.stop="onUnitsBlockClick(messageUnits)"
      >
        <div
          v-for="u in messageUnits"
          :key="u instanceof BaseUnit ? u.id : u"
          class="unit-card"
        >
          <div class="unit-name" :class="{ 'unit-name-fallback': isFallbackUnitTitle(u) }">
            {{ getMessageUnitTitle(u) }}
          </div>
        </div>
      </div>

      <button
        v-if="message.quotedMessageId"
        class="quoted-message-preview"
        type="button"
        @click.stop="emit('focusQuotedMessage', message.quotedMessageId)"
      >
        <span class="quoted-message-preview-label">
          {{ t('chat.quote_link') }}: {{ quotedMessageAuthor }}
        </span>
        <span class="quoted-message-preview-text">
          {{ quotedMessagePreview || `#${message.quotedMessageId.slice(0, 8)}` }}
        </span>
      </button>

      <div v-if="canShowOrders && orderPreview.length" class="orders-panel">
        <div class="orders-panel-title">
          Orders ({{ message.orders?.status ?? 'unknown' }})
        </div>
        <div
          v-for="item in orderPreview"
          :key="`order-${message.id}-${item.unitId}`"
          class="orders-panel-row"
        >
          <span class="orders-panel-unit">{{ item.unitLabel }}</span>
          <span class="orders-panel-actions">{{ item.commandNames.join(', ') || 'none' }}</span>
        </div>
      </div>

      <div
        v-if="!hasMessageUnitTags"
        class="text markdown"
        v-html="renderMarkdown(resolvedMessageText)"
      />

      <div v-else class="text markdown">
        <div
          v-for="(line, lineIdx) in messageUnitTagLines"
          :key="`${message.id}-tagline-${lineIdx}`"
          class="message-inline-line"
          :class="{ 'message-inline-line-clickable': line.units.length > 0 }"
          @click.stop="onUnitsBlockClick(line.units)"
        >
          <span
            v-if="line.text"
            class="message-inline-text"
            v-html="renderMarkdownInline(line.text)"
          />
          <span
            v-for="u in line.units"
            :key="`inline-${message.id}-${lineIdx}-${u instanceof BaseUnit ? u.id : u}`"
            class="unit-card unit-card-inline"
            @click.stop="onUnitsBlockClick([u])"
          >
            <span class="unit-name" :class="{ 'unit-name-fallback': isFallbackUnitTitle(u) }">
              {{ getMessageUnitTitle(u) }}
            </span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-message {
  width: 90%;
  padding: 6px 8px;
  border-radius: 8px;
  background: #020617;
  border: 1px solid #334155;
}

.chat-message .author {
  flex: 1;
  min-width: 0;
  max-width: 100%;
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

.chat-message-wrapper.highlighted {
  animation: quoted-message-highlight 5s ease-out;
}

@keyframes quoted-message-highlight {
  0% {
    background: color-mix(in srgb, #facc15 28%, transparent);
  }
  20% {
    background: color-mix(in srgb, #facc15 16%, transparent);
  }
  100% {
    background: transparent;
  }
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
  gap: 8px;
  font-size: 11px;
  color: #dbe5f3;
}

.author-block {
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
  gap: 8px;
  overflow: hidden;
}

.author-avatar {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  overflow: hidden;
  flex-shrink: 0;
  background: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
}

.author-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.author-avatar-fallback {
  display: block;
  width: 100%;
  height: 100%;
}

.meta-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.datetime {
  white-space: nowrap;
}

.text {
  margin-top: 5px;
  font-size: var(--chat-text-size, 15px);
  white-space: normal;
  word-break: break-word;
}

.markdown {
  line-height: 1.4;
  word-break: break-word;
}

.markdown p {
  margin: 4px 0;
}

.markdown strong {
  font-weight: 700;
}

.markdown em {
  font-style: italic;
}

.markdown code {
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
}

.markdown pre {
  background: #020617;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 8px;
  overflow-x: auto;
  margin: 6px 0;
}

.markdown pre code {
  background: none;
  padding: 0;
}

.markdown blockquote {
  border-left: 3px solid var(--accent);
  padding-left: 8px;
  margin: 6px 0;
  opacity: 0.8;
}

.markdown ul,
.markdown ol {
  padding-left: 18px;
  margin: 4px 0;
}

.markdown li {
  line-height: 1.2;
  margin: 1px 0;
}

.markdown li p {
  margin: 0;
}

.markdown a {
  color: #38bdf8;
  text-decoration: underline;
}

.markdown img {
  display: block;
  max-width: min(100%, 360px);
  width: auto;
  height: auto;
  margin: 8px 0;
  border-radius: 8px;
  border: 1px solid #334155;
  background: #020617;
}

.markdown hr {
  border: 0;
  border-top: 1px solid #334155;
  margin: 8px 0;
}

.message-units {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  cursor: pointer;
}

.message-inline-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.message-inline-line-clickable {
  cursor: pointer;
}

.message-inline-text :deep(p) {
  margin: 0;
}

.unit-card-inline {
  min-width: unset;
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

.unit-name-fallback {
  color: #ef4444;
}

.spawn-messenger-btn {
  background: #0f172a;
  border: 1px solid #38bdf8;
  color: #38bdf8;
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

.edit-message-btn {
  background: #0f172a;
  border: 1px solid #38bdf8;
  color: #38bdf8;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  cursor: pointer;
  line-height: 1;
}

.edit-message-btn:hover {
  background: #38bdf8;
  color: #020617;
}

.quote-message-btn {
  background: #0f172a;
  border: 1px solid #a78bfa;
  color: #a78bfa;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  cursor: pointer;
  line-height: 1;
}

.quote-message-btn:hover {
  background: #a78bfa;
  color: #020617;
}

.mark-read-btn {
  margin-left: 8px;
  background: #0f172a;
  border: 1px solid #38bdf8;
  color: #38bdf8;
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

.quoted-message-preview {
  margin-top: 6px;
  border: none;
  background: rgba(167, 139, 250, 0.08);
  border-left: 3px solid #a78bfa;
  border-radius: 0 8px 8px 0;
  color: #e2e8f0;
  cursor: pointer;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.quoted-message-preview:hover {
  background: rgba(167, 139, 250, 0.16);
}

.self .quoted-message-preview {
  background: rgba(15, 23, 42, 0.14);
  border-left-color: #0f172a;
  color: #0f172a;
}

.self .quoted-message-preview:hover {
  background: rgba(15, 23, 42, 0.22);
}

.quoted-message-preview-label {
  color: #c4b5fd;
  font-size: 11px;
}

.self .quoted-message-preview-label {
  color: rgba(15, 23, 42, 0.82);
}

.quoted-message-preview-text {
  color: #cbd5e1;
  font-size: 12px;
  line-height: 1.35;
  white-space: normal;
  word-break: break-word;
  line-clamp: 2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.self .quoted-message-preview-text {
  color: rgba(2, 6, 23, 0.9);
}

.orders-panel {
  margin-top: 6px;
  padding: 6px 8px;
  border: 1px solid #334155;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.45);
  font-size: 11px;
}

.orders-panel-title {
  color: #93c5fd;
  margin-bottom: 4px;
}

.orders-panel-row {
  display: flex;
  gap: 6px;
}

.orders-panel-unit {
  font-weight: 600;
}

.orders-panel-actions {
  opacity: 0.95;
}
</style>
