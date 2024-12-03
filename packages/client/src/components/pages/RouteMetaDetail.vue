<script setup lang="ts">
import type { PageMeta } from '@uni-helper/devtools-types'
import { VueCodeBlock } from '@vue/devtools-ui'

defineProps<{
  meta: PageMeta
}>()

defineEmits<{
  close: []
}>()
</script>

<template>
  <div p-2>
    <div class="flex items-center justify-between">
      <span class="font-500">Page meta detail</span>
      <div class="i-carbon-close cursor-pointer p1 $ui-text" @click="$emit('close')" />
    </div>
    <VueCodeBlock :code="JSON.stringify(meta, null, 2)" lang="json" lines />
  </div>
</template>
