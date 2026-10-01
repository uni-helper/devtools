<script setup lang="ts">
import type { StateField } from './types'
import StateFieldRow from './StateFieldRow.vue'

defineProps<{
  title: string
  hint?: string
  componentId: string
  fields: StateField[]
}>()
</script>

<template>
  <section>
    <!-- 分组头对齐 Vue Devtools 的小写弱化样式：setup (7) / data (2) -->
    <div class="flex items-baseline gap-1.5 px-2 py-1 sticky top-0 bg-base z-nav select-none">
      <span class="text-xs op-mute font-medium">{{ title.toLowerCase() }}</span>
      <span class="text-[10px] op-mute tabular-nums">({{ fields.length }})</span>
      <span v-if="hint" class="text-[10px] op-mute">{{ hint }}</span>
    </div>
    <div class="flex flex-col">
      <StateFieldRow
        v-for="field in fields"
        :key="`${componentId}:${field.key}`"
        :field="field"
        :component-id="componentId"
      />
    </div>
  </section>
</template>
