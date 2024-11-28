<script setup lang="ts">
import type { InspectorNodeTag } from '@vue/devtools-kit'
import { vTooltip } from '@vue/devtools-ui'

defineProps<{
  tag: InspectorNodeTag
}>()

function toHex(color: number) {
  return color.toString(16).padStart(6, '0')
}
</script>

<template>
  <span
    v-tooltip="{
      content: tag.tooltip,
      html: true,
    }"
    :style="{
      color: `#${toHex(tag.textColor)}`,
      backgroundColor: `#${toHex(tag.backgroundColor)}`,
    }"
    class="ml-2 rounded-sm px-1 text-[0.75rem] leading-snug"
  >
    {{ tag.label }}
  </span>
</template>
