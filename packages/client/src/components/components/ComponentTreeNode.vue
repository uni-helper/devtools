<script setup lang="ts">
import type { ComponentTreeNode } from '~/types/index'

withDefaults(defineProps<{
  data: ComponentTreeNode
  depth?: number
}>(), {
  depth: 0,
})
</script>

<template>
  <div
    class="mb1 flex flex-col cursor-pointer"
  >
    <span
      class="group font-state-field flex items-center justify-between rounded-1 text-4 focus:(bg-primary-300 dark:bg-gray-600) hover:(bg-primary-300 dark:bg-gray-600)"
      :style=" { paddingLeft: `${15 * depth}px` }"
      tabindex="0"
    >
      <div>
        <span class="text-gray-400 dark:text-gray-600 group-hover:(text-white op50) group-focus:(op50 text-white!)">&lt;</span>
        <span group-hover:text-white class="ws-nowrap">{{ data.name }}</span>
        <span class="text-gray-400 dark:text-gray-600 group-hover:(text-white op50) group-focus:(op50 text-white!)">&gt;</span>
      </div>

      <div
        v-if="data.file"
        i-material-symbols:my-location-outline-rounded mr3 op-0 group-focus:op50 group-hover:op-50
        class="hover:op-100!"
        @click="openInEditor(data.file)"
      />
    </span>
    <template v-if="data.children?.length">
      <ComponentTreeNode
        v-for="child in data.children" :key="child.name"
        :data="child"
        :depth="depth + 1"
      />
    </template>
  </div>
</template>
