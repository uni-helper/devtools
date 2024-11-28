<script setup lang="ts">
import type { ComponentTreeNode } from '@uni-helper/devtools-types'
import ToggleExpanded from '~/components/basic/ToggleExpanded.vue'
import ComponentTreeViewer from '~/components/tree/TreeViewer.vue'
import { useSelect } from '~/composables/select'
import { useToggleExpanded } from '~/composables/toggle-expanded'

withDefaults(defineProps<{
  data: ComponentTreeNode[]
  depth: number
  withTag: boolean
}>(), {
  depth: 0,
  withTag: false,
})

const emit = defineEmits(['hover', 'leave'])

const selectedNodeId = defineModel()
const { expanded, toggleExpanded } = useToggleExpanded()
const { select: _select } = useSelect()

function select(id: string) {
  selectedNodeId.value = id
}
</script>

<template>
  <div
    v-for="(item, index) in data"
    :key="index"
    :class="{
      'min-w-max': depth === 0,
    }"
  >
    <div
      class="group flex cursor-pointer items-center justify-between rounded-1 hover:(bg-primary-300 dark:bg-gray-600)"
      :style=" { paddingLeft: `${15 * depth + 4}px` }"
      :class="{ 'bg-primary-600! active': selectedNodeId === item.id }"
      @click="select(item.id)"
      @dblclick="toggleExpanded(item.id)"
      @mouseover="() => emit('hover', item.id)"
      @mouseleave="() => emit('leave')"
    >
      <div>
        <ToggleExpanded
          v-if="item?.children?.length"
          :value="expanded.includes(item.id)"
          class="[.active_&]:op20 group-hover:op20"
          @click.stop="toggleExpanded(item.id)"
        />
        <!-- placeholder -->
        <span v-else pl5 />
        <span font-state-field>
          <span v-if="withTag" class="text-gray-400 dark:text-gray-600 group-hover:(text-white op50) [.active_&]:(op50 text-white!)">&lt;</span>
          <span group-hover:text-white class="ws-nowrap [.active_&]:(text-white)">{{ item.name }}</span>
          <span v-if="withTag" class="text-gray-400 dark:text-gray-600 group-hover:(text-white op50) [.active_&]:(op50 text-white!)">&gt;</span>
        </span>
      </div>
      <div
        v-if="item.file"
        i-material-symbols:my-location-outline-rounded mr3 op-0 group-focus:op50 group-hover:op-50
        class="hover:op-100!"
        @click="openInEditor(item.file)"
      />
    </div>
    <div v-if="item?.children?.length && (expanded.includes(item.id) || depth < 2)">
      <ComponentTreeViewer
        v-model="selectedNodeId" :data="item?.children" :depth="depth + 1" :with-tag="withTag" @hover="(id) => emit('hover', id)" @leave="emit('leave')"
      />
    </div>
  </div>
</template>
