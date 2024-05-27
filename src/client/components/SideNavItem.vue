<script setup lang="ts">
import { VueTooltip } from '@vue/devtools-ui'
import type { ModuleBuiltinTab } from '~/types'

const props = defineProps<{
  tab: ModuleBuiltinTab
}>()
</script>

<template>
  <VueTooltip placement="right">
    slot
  </VueTooltip>
</template>
