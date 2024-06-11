<script setup lang="ts">
import type { ComponentTreeNode } from './../../types/index'

withDefaults(defineProps<{
  data: ComponentTreeNode
  depth?: number
}>(), {
  depth: 0,
})
</script>

<template>
  <div
    selectable-item
    :style="{
      paddingLeft: `${depth * 15 + 4}px`,
    }"
  >
    <span text-primary-400 group-hover:text-white class="[.active_&]:text-white">
      {{ data.name }}
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
