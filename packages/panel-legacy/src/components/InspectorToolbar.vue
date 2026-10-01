<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import FormSearchField from '@antfu/design/components/Form/FormSearchField.vue'
import { computed } from 'vue'
import { toolbar } from '@design/design'
import { inspector } from '../state/inspector'

const { filterText, pages, rows, treeLoading, fetchedAt, refreshTree } = inspector

const meta = computed(() => {
  const parts: string[] = []
  if (pages.value.length > 0) {
    parts.push(`${pages.value.length} 页面`)
    parts.push(`${rows.value.length} 节点`)
  }
  if (fetchedAt.value)
    parts.push(`更新于 ${new Date(fetchedAt.value).toLocaleTimeString()}`)
  return parts.join(' · ')
})
</script>

<template>
  <div :class="toolbar('shrink-0 border-r border-base')">
    <FormSearchField
      v-model="filterText"
      placeholder="过滤组件名称或路径…"
      size="sm"
      class="w-64!"
    />
    <ActionIconButton
      :icon="treeLoading ? 'i-ph:circle-notch animate-spin' : 'i-ph:arrow-clockwise'"
      :disabled="treeLoading"
      tooltip="刷新组件树"
      label="刷新组件树"
      @click="refreshTree"
    />

    <span class="flex-1" />
    <span class="text-xs op-mute tabular-nums select-none">{{ meta }}</span>
  </div>
</template>
