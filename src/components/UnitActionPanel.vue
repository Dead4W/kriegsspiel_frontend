<script setup lang="ts">
import {computed, onMounted, onUnmounted, type UnwrapRef} from 'vue'
import type {BaseUnit} from '@/engine/units/baseUnit'
import {Team} from '@/enums/teamKeys'
import UnitEnvModifierTool from "@/components/tools/UnitEnvModifierTool.vue";
import {useI18n} from 'vue-i18n'
import UnitCommandTool from "@/components/tools/UnitCommandTool.vue";
import type {unsub} from "@/engine/events";
import {unitType} from "@/engine";

const {t} = useI18n()

/* ================= props / emits ================= */

const props = defineProps<{
  units: UnwrapRef<BaseUnit[]>
}>()

const emit = defineEmits<{
  (e: 'edit'): void
}>()

/* ================= access ================= */

const isAdmin = computed(
  () => window.PLAYER?.team === Team.ADMIN
)

const hasUnits = computed(
  () => props.units.length > 0
)

function isMessenger() {
  return props.units.filter(u => u.type === unitType.MESSENGER).length === props.units.length;
}

/* ================= actions ================= */

function attack() {
  emit('edit')
}

function edit() {
  emit('edit')
}

</script>

<template>
  <div
    v-if="hasUnits"
    class="action-panel"
  >
    <!-- ===== ENV MODIFIERS ===== -->
    <UnitEnvModifierTool
      v-if="!isMessenger()"
      :units="units as BaseUnit[]"
      @edit="edit"
    />

    <UnitCommandTool
      v-if="isAdmin"
      :units="units as BaseUnit[]"
      @attack="attack"
      @move="edit"
      @formation="edit"
    />
  </div>
</template>

<style scoped>
.action-panel {
  display: flex;
  gap: 8px;
  padding: 6px 12px;

  align-items: stretch;
}

</style>
