<script setup lang="ts">
import {computed, type UnwrapRef} from 'vue'
import type {BaseUnit} from '@/engine/units/baseUnit'
import {Team} from '@/enums/teamKeys'
import {unitType} from "@/engine";
import UnitEnvModifierTool from "@/components/tools/UnitEnvModifierTool.vue";
import UnitCommandTool from "@/components/tools/UnitCommandTool.vue";
import {canPlayerUseDirectViewOrder} from "@/engine/units/directViewOrderRules.ts";

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

const canUsePlayerSelectedOrderTool = computed(() => {
  return canPlayerUseDirectViewOrder(props.units)
})

const canShowUnitCommandTool = computed(
  () => isAdmin.value || canUsePlayerSelectedOrderTool.value
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
      v-if="canShowUnitCommandTool"
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
