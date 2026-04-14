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

const user = ref<{ id: number; name: string; email?: string; avatar_url?: string; picture?: string; provider?: string } | null>(null)
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
      <div class="card-header">
        <router-link class="brand-link" :to="{ name: 'home', params: { locale: route.params.locale } }">
          {{ t('title') }}
        </router-link>
      </div>
      <h1>{{ t('profile') }}</h1>

      <template v-if="loading">
        <p class="text">{{ t('loading') }}</p>
      </template>

      <template v-else-if="user">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar" :class="{ 'has-image': user.avatar_url || user.picture }">
            <img v-if="user.avatar_url || user.picture" :src="(user.avatar_url || user.picture)!" :alt="user.name" />
            <span v-else class="avatar-initials">{{ user.name.slice(0, 2).toUpperCase() }}</span>
          </div>
          <span v-if="user.provider === 'google'" class="provider-badge" :title="t('authModal.signInWithGoogle')">
            <svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          </span>
        </div>
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

.card-header {
  display: flex;
  justify-content: center;
  margin-bottom: 0.75rem;
}

.brand-link {
  display: block;
  margin: 0;
  color: var(--text);
  text-decoration: none;
  font-size: 3rem;
  letter-spacing: 0.2em;
  font-weight: 700;
  line-height: 1;
}

.brand-link:hover {
  color: var(--accent);
}

.profile-avatar-wrap {
  position: relative;
  display: inline-flex;
  margin-bottom: 1rem;
}

.profile-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.6);
  border: 2px solid rgba(148, 163, 184, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.profile-avatar.has-image {
  padding: 0;
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-initials {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-muted);
}

.provider-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 28px;
  height: 28px;
  padding: 4px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-lg);
}

.provider-badge .google-icon {
  width: 18px;
  height: 18px;
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
