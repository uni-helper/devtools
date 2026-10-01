<script setup lang="ts">
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import { computed } from 'vue'
import type { TreeRow as InspectorRow } from '../state/inspector'
import { inspector } from '../state/inspector'

const props = defineProps<{ row: InspectorRow }>()

const { selectedId, toggleExpand, select } = inspector

const node = computed(() => props.row.node)
const isSelected = computed(() => selectedId.value === node.value.id)
// Windows 构建链可能给出反斜杠路径，两种分隔符都要能切出短文件名。
const fileName = computed(() => node.value.file?.split(/[\\/]/).pop())

/**
 * 搜索命中高亮：按匹配下标切成三段渲染（不用 v-html，组件名来自被调试
 * 小程序，不往页面里注入任何字符串）。
 */
const nameParts = computed(() => {
  const q = inspector.filterText.value.trim().toLowerCase()
  const name = node.value.name
  const idx = q ? name.toLowerCase().indexOf(q) : -1
  if (idx < 0 || !q)
    return { before: name, match: '', after: '' }
  return {
    before: name.slice(0, idx),
    match: name.slice(idx, idx + q.length),
    after: name.slice(idx + q.length),
  }
})
</script>

<template>
  <div
    role="treeitem"
    :aria-selected="isSelected"
    :aria-level="row.depth + 1"
    class="group flex h-6 items-center gap-1.5 pr-2 cursor-pointer select-none"
    :class="isSelected ? 'bg-active color-base' : 'op-fade hover:op-100 hover:bg-active'"
    :style="{ paddingLeft: `${6 + row.depth * 16}px` }"
    @click="select(node.id)"
  >
    <!-- 展开箭头；叶子节点显示占位短线，保持缩进对齐。 -->
    <span
      class="w-4 h-4 flex items-center justify-center shrink-0 rounded"
      :class="row.hasChildren ? 'cursor-pointer hover:bg-active' : ''"
      :aria-expanded="row.hasChildren ? row.expanded : undefined"
      @click.stop="row.hasChildren && toggleExpand(node.id)"
    >
      <span
        class="text-xs op-mute"
        :class="row.hasChildren ? (row.expanded ? 'i-ph:caret-down' : 'i-ph:caret-right') : 'i-ph:minus'"
      />
    </span>

    <span
      class="text-sm shrink-0"
      :class="node.type === 'page' ? 'i-ph:device-mobile-duotone color-active' : 'i-ph:cube-duotone op-mute'"
      aria-hidden="true"
    />

    <span class="font-mono text-xs whitespace-nowrap">
      <span class="op-mute">&lt;</span>
      <template v-if="nameParts.match">
        <span>{{ nameParts.before }}</span><mark>{{ nameParts.match }}</mark><span>{{ nameParts.after }}</span>
      </template>
      <template v-else>
        {{ node.name }}
      </template>
      <span class="op-mute">&gt;</span>
    </span>

    <DisplayBadge
      v-if="node.type === 'page'"
      text="page"
      color="violet"
      class="text-[10px] shrink-0"
    />
    <DisplayBadge
      v-if="row.failed"
      text="采集失败"
      color="red"
      class="text-[10px] shrink-0"
    />

    <span class="flex-1" />
    <span
      v-if="fileName"
      class="font-mono text-[11px] op-mute truncate max-w-[45%] group-hover:inline"
      :title="node.file"
    >{{ fileName }}</span>
  </div>
</template>
