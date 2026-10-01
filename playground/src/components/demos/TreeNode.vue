<script setup lang="ts">
import { ref } from 'vue'

export interface TreeNodeData {
  id: string
  label: string
  type: 'folder' | 'file'
  children?: TreeNodeData[]
}

defineOptions({
  name: 'TreeNode',
})

const props = withDefaults(
  defineProps<{
    node: TreeNodeData
    depth?: number
  }>(),
  {
    depth: 0,
  }
)

const isExpanded = ref(true)

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

function handleAddChild() {
  if (!props.node.children) {
    props.node.children = []
  }
  const newId = `${props.node.id}-${props.node.children.length + 1}`
  props.node.children.push({
    id: newId,
    label: `DynamicNode_${newId}`,
    type: Math.random() > 0.5 ? 'folder' : 'file',
    children: [],
  })
  isExpanded.value = true
}

function handleRemoveChild(idx: number) {
  props.node.children?.splice(idx, 1)
}
</script>

<template>
  <view class="tree-node" :style="{ marginLeft: `${props.depth * 14}px` }" my-1 text-xs>
    <view
      flex items-center justify-between p="x-2 y-1"
      rounded hover:bg="gray-100 dark:gray-700"
      border="~ solid gray-100 dark:gray-700"
      bg="gray-50/70 dark:gray-800/70"
    >
      <view flex items-center gap-1.5 cursor-pointer @click="toggleExpand">
        <text
          v-if="props.node.children?.length"
          :class="isExpanded ? 'i-carbon-chevron-down' : 'i-carbon-chevron-right'"
          text-gray-400 text-xs
        />
        <text
          v-else
          class="i-carbon-document"
          text-gray-300 text-xs
        />

        <text
          :class="props.node.type === 'folder' ? 'text-amber-600 font-bold' : 'text-gray-700 dark:text-gray-200'"
        >
          {{ props.node.label }}
        </text>
        <text text="10px gray-400" font-mono>({{ props.node.id }})</text>
      </view>

      <view flex items-center gap-1>
        <button
          v-if="props.node.type === 'folder'"
          size="mini"
          text="10px white"
          bg="teal-600"
          px-1.5 py-0.5 rounded
          @click.stop="handleAddChild"
        >
          + 动态加子节点
        </button>
      </view>
    </view>

    <!-- 递归渲染子树节点（在 DevTools 树中展示无限层级展开、折叠与高亮更新） -->
    <view v-if="props.node.children?.length && isExpanded" mt-1>
      <view v-for="(child, idx) in props.node.children" :key="child.id" relative>
        <TreeNode :node="child" :depth="props.depth + 1" />
      </view>
    </view>
  </view>
</template>
