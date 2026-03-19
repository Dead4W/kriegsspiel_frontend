<script setup lang="ts">
defineProps<{
  keyLabel: string
  inline?: boolean
}>()
</script>

<template>
  <span class="hotkey-tag" :class="{ inline }">{{ keyLabel }}</span>
</template>

<style scoped>
.hotkey-tag {
  position: absolute;
  left: -8px;
  top: -8px;

  min-width: 16px;
  height: 16px;
  padding: 0 4px;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  font-size: 10px;
  font-weight: 600;
  line-height: 1;

  color: #e2e8f0;
  background: #334155;
  border: 1px solid var(--accent);
  border-radius: 4px;

  pointer-events: none;
}

.hotkey-tag.inline {
  position: relative;
  left: 0;
  top: 0;
}
</style>
