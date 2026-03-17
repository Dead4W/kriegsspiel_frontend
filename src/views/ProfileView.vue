<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useHead } from '@vueuse/head'
import api from '@/api/client'
import type {Team} from "@/enums/teamKeys.ts";

interface UserRoom {
  uuid: string
  name: string
  team: Team
  key: string | null
  created_at: string
}

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

const user = ref<{ id: number; name: string; email?: string } | null>(null)
const rooms = ref<UserRoom[]>([])
const loading = ref(true)
const roomsLoading = ref(true)

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
          <p class="profile-name">{{ user.name }}</p>
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
                  {{ teamLabel(room.team) }} · {{ formatDate(room.created_at) }}
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
</style>
