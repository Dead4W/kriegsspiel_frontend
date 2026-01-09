<script setup lang="ts">
import type {world} from '@/engine'
import {useI18n} from 'vue-i18n'
import {RoomGameStage} from "@/enums/roomStage.ts";
import {Team} from "@/enums/teamKeys.ts";
import {onMounted, onUnmounted, ref} from "vue";

const { t } = useI18n()

const props = defineProps<{
  world: world
}>()

const stage = ref(window.ROOM_WORLD.stage);
const copiedTeam = ref<Team | null>(null)

/* ================= actions ================= */

function startWar() {
  window.ROOM_WORLD.setStage(RoomGameStage.WAR);
}

function endWar() {
  window.ROOM_WORLD.setStage(RoomGameStage.END);
}

function copyBlueBoard() {
  window.ROOM_WORLD.events.emit('api', {type: "copy_board", data: Team.BLUE})
}

function copyRedBoard() {
  window.ROOM_WORLD.events.emit('api', {type: "copy_board", data: Team.RED})
}

function sync() {
  stage.value = window.ROOM_WORLD.stage;
}

function copyTeamLink(team: Team) {
  const host = window.location.origin;
  const roomUUID = window.ROOM_WORLD.id;

  const keyName = `${team}_key` as keyof typeof window.ROOM_KEYS;
  const key = window.ROOM_KEYS[keyName];

  if (!key) return;

  const link = `${host}/room/${roomUUID}/key/${key}?team=${team}`;

  navigator.clipboard.writeText(link).then(() => {
    copiedTeam.value = team;

    setTimeout(() => {
      copiedTeam.value = null;
    }, 2000);
  });
}

/* LIFE CYCLE */

onMounted(() => {
  window.ROOM_WORLD.events.on('changed', sync)
  sync()
})
onUnmounted(() => {
  window.ROOM_WORLD.events.off('changed', sync)
})

</script>

<template>
  <div class="admin-panel">
    <h3>{{ t('tools.admin.title') }}</h3>

    <button class="danger" @click="startWar" v-if="stage === RoomGameStage.PLANNING">
      ⚔️ {{ t('tools.admin.start_war') }}
    </button>

    <button class="danger" @click="endWar" v-if="stage === RoomGameStage.WAR">
      ⚔️ {{ t('tools.admin.end_war') }}
    </button>

    <button @click="copyBlueBoard" v-if="stage === RoomGameStage.PLANNING">
      📋 {{ t('tools.admin.copy_blue') }}
    </button>

    <button @click="copyRedBoard" v-if="stage === RoomGameStage.PLANNING">
      📋 {{ t('tools.admin.copy_red') }}
    </button>

    <button @click="copyTeamLink(Team.ADMIN)">
      <span v-if="copiedTeam === Team.ADMIN">✅ {{ t('copied') }}</span>
      <span v-else>🔗 {{ t('tools.admin.copy_team_link') }} {{ t('team.admin') }}</span>
    </button>

    <button @click="copyTeamLink(Team.RED)">
      <span v-if="copiedTeam === Team.RED">✅ {{ t('copied') }}</span>
      <span v-else>
        🔗 {{ t('tools.admin.copy_team_link') }}
        <span style="color:#ef4444">{{ t('team.red') }}</span>
      </span>
    </button>

    <button @click="copyTeamLink(Team.BLUE)">
      <span v-if="copiedTeam === Team.BLUE">✅ {{ t('copied') }}</span>
      <span v-else>
        🔗 {{ t('tools.admin.copy_team_link') }}
        <span style="color:#3a82f6">{{ t('team.blue') }}</span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.admin-panel {
  position: absolute;
  top: 64px;
  left: 16px;

  width: 340px;
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

button {
  width: 100%;
  margin-bottom: 8px;
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
</style>
