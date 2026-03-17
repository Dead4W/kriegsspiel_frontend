<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useHead } from '@vueuse/head'
import api from '@/api/client'
import type {Team} from "@/enums/teamKeys.ts";
import {RoomGameStage} from "@/enums/roomStage.ts";

interface UserRoom {
  uuid: string
  name: string
  team: Team
  key: string | null
  stage?: RoomGameStage
  ingame_time?: string
  options?: Record<string, unknown>
  admin_id?: number
  map_url?: string | null
  height_map_url?: string | null
  weather?: string | null
  created_at: string
  updated_at?: string
}

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

const user = ref<{ id: number; name: string; email?: string } | null>(null)
const rooms = ref<UserRoom[]>([])
const loading = ref(true)
const roomsLoading = ref(true)

const editingNickname = ref(false)
const nicknameInput = ref('')
const nicknameError = ref('')
const nicknameLoading = ref(false)

const NICKNAME_MIN = 3
const NICKNAME_MAX = 32

useHead(() => ({
  title: t('profileSeo.title'),
  meta: [
    { name: 'description', content: t('profileSeo.description') }
  ],
  htmlAttrs: { lang: locale.value }
}))

async function loadProfile() {
  try {
    const [authRes, roomsRes] = await Promise.all([
      api.get('/user/auth'),
      api.get('/user/rooms')
    ])
    user.value = authRes.data
    rooms.value = roomsRes.data
  } catch {
    router.push({ name: 'home', params: { locale: route.params.locale } })
  } finally {
    loading.value = false
    roomsLoading.value = false
  }
}

function goToRoom(room: UserRoom) {
  if (room.key) {
    router.push({
      name: 'room-key',
      params: { locale: route.params.locale, uuid: room.uuid, key: room.key }
    })
  } else {
    router.push({
      name: 'room',
      params: { locale: route.params.locale, uuid: room.uuid }
    })
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(locale.value, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return iso
  }
}

function teamLabel(team: UserRoom['team']) {
  return t(`profile.team.${team}`)
}

function stageLabel(stage: string | undefined) {
  if (!stage) return ''
  const key = `profile.stage.${stage}`
  const translated = t(key)
  return translated !== key ? translated : stage
}

function startEditNickname() {
  nicknameInput.value = user.value?.name ?? ''
  nicknameError.value = ''
  editingNickname.value = true
}

function cancelEditNickname() {
  editingNickname.value = false
  nicknameError.value = ''
}

async function saveNickname() {
  const name = nicknameInput.value.trim()
  if (name.length < NICKNAME_MIN || name.length > NICKNAME_MAX) {
    nicknameError.value = t('profile.nicknameLengthError')
    return
  }
  if (name === user.value?.name) {
    cancelEditNickname()
    return
  }

  nicknameLoading.value = true
  nicknameError.value = ''
  try {
    const { data } = await api.patch('/user/nickname', { name })
    user.value = { ...user.value!, ...data }
    cancelEditNickname()
  } catch {
    nicknameError.value = t('profile.nicknameError')
  } finally {
    nicknameLoading.value = false
  }
}

function signOut() {
  localStorage.removeItem('token')
  localStorage.removeItem('user_id')
  router.push({ name: 'home', params: { locale: route.params.locale } })
}

onMounted(loadProfile)
</script>

<template>
  <section class="profile">
    <div class="card">
      <h1>{{ t('profile') }}</h1>

      <template v-if="loading">
        <p class="text">{{ t('loading') }}</p>
      </template>

      <template v-else-if="user">
        <div class="profile-info">
          <template v-if="editingNickname">
            <div class="nickname-edit">
              <input
                v-model="nicknameInput"
                type="text"
                :placeholder="t('authModal.nickname')"
                :disabled="nicknameLoading"
                maxlength="32"
                @keyup.enter="saveNickname"
                @keyup.escape="cancelEditNickname"
              />
              <p v-if="nicknameError" class="error">{{ nicknameError }}</p>
              <div class="nickname-actions">
                <button class="outline small" @click="cancelEditNickname" :disabled="nicknameLoading">
                  {{ t('profile.cancel') }}
                </button>
                <button class="primary small" @click="saveNickname" :disabled="nicknameLoading">
                  {{ nicknameLoading ? '...' : t('profile.saveNickname') }}
                </button>
              </div>
            </div>
          </template>
          <template v-else>
            <p class="profile-name">{{ user.name }}</p>
            <button class="edit-nickname-btn" @click="startEditNickname">
              {{ t('profile.changeNickname') }}
            </button>
          </template>
          <p v-if="user.email" class="profile-email">{{ user.email }}</p>
        </div>

        <div class="actions">
          <button class="outline" @click="signOut">
            {{ t('profile.signOut') }}
          </button>
        </div>

        <div class="rooms-section">
          <h2>{{ t('profile.myRooms') }}</h2>
          <p v-if="roomsLoading" class="text">{{ t('loading') }}</p>
          <p v-else-if="rooms.length === 0" class="text">{{ t('profile.noRooms') }}</p>
          <ul v-else class="rooms-list">
            <li
              v-for="room in rooms"
              :key="room.uuid"
              class="room-item"
              @click="goToRoom(room)"
            >
              <div class="room-info">
                <span class="room-name">{{ room.name }}</span>
                <span class="room-meta">
                  {{ teamLabel(room.team) }}
                  <template v-if="room.stage"> · {{ stageLabel(room.stage) }}</template>
                  · {{ formatDate(room.created_at) }}
                </span>
              </div>
              <span class="room-join">{{ t('profile.joinRoom') }}</span>
            </li>
          </ul>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.profile {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
}

.card {
  max-width: 520px;
  width: 100%;
  padding: 3rem;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-lg);
  text-align: center;
  box-shadow:
    var(--shadow-lg),
    var(--shadow-inset);
}

.profile-info {
  margin: 1.5rem 0 2rem;
}

.profile-name {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.profile-email {
  margin: 0.25rem 0 0;
  color: var(--text-muted);
  font-size: 0.95rem;
}

.text {
  color: var(--text-muted);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.actions .primary,
.actions .outline {
  padding: 0.75rem 1.5rem;
  min-width: 200px;
  text-align: center;
  text-decoration: none;
  border-radius: var(--radius, 8px);
  font-size: 1rem;
  cursor: pointer;
}

.actions .primary {
  background: var(--accent);
  color: var(--accent-contrast);
  border: none;
}

.actions .primary:hover {
  background: var(--accent-hover);
}

.actions .outline {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid rgba(148, 163, 184, 0.35);
}

.actions .outline:hover {
  border-color: rgba(148, 163, 184, 0.55);
  color: var(--text);
}

.rooms-section {
  margin-top: 2.5rem;
  padding-top: 2rem;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  text-align: left;
}

.rooms-section h2 {
  margin: 0 0 1rem;
  font-size: 1.1rem;
  color: var(--text);
}

.rooms-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.room-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: var(--radius, 8px);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.room-item:hover {
  border-color: rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.6);
}

.room-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.room-name {
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-meta {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.room-join {
  flex-shrink: 0;
  font-size: 0.9rem;
  color: var(--accent);
}

.edit-nickname-btn {
  margin-top: 0.5rem;
  padding: 0;
  background: none;
  border: none;
  color: var(--accent);
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: underline;
}

.edit-nickname-btn:hover {
  color: var(--accent-hover);
}

.nickname-edit {
  text-align: left;
}

.nickname-edit input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: var(--radius, 8px);
  color: var(--text);
  font-size: 1rem;
}

.nickname-edit .error {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
  color: var(--danger);
}

.nickname-actions {
  display: flex;
  gap: 0.5rem;
}

.nickname-actions .small {
  padding: 0.5rem 1rem;
  min-width: auto;
  font-size: 0.9rem;
}
</style>
