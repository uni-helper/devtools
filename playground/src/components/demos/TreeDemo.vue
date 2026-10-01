<script setup lang="ts">
import { reactive } from 'vue'
import TreeNode, { type TreeNodeData } from './TreeNode.vue'

defineOptions({
  name: 'TreeDemo',
})

const treeData = reactive<TreeNodeData>({
  id: 'root',
  label: 'playground/src',
  type: 'folder',
  children: [
    {
      id: 'c-components',
      label: 'components',
      type: 'folder',
      children: [
        {
          id: 'c-demos',
          label: 'demos',
          type: 'folder',
          children: [
            { id: 'f-props', label: 'PropsBasicDemo.vue', type: 'file' },
            { id: 'f-model', label: 'ModelTwoWayDemo.vue', type: 'file' },
            { id: 'f-events', label: 'EventsEmitsDemo.vue', type: 'file' },
          ],
        },
        { id: 'f-logo', label: 'AppLogos.vue', type: 'file' },
      ],
    },
    {
      id: 'c-pages',
      label: 'pages',
      type: 'folder',
      children: [
        { id: 'f-index', label: 'index.vue', type: 'file' },
        { id: 'f-hi', label: 'hi.vue', type: 'file' },
      ],
    },
    {
      id: 'f-main',
      label: 'main.ts',
      type: 'file',
    },
  ],
})

function resetTree() {
  treeData.children = [
    {
      id: 'c-reset',
      label: 'reset_folder',
      type: 'folder',
      children: [{ id: 'f-leaf', label: 'leaf.vue', type: 'file' }],
    },
  ]
}
</script>

<template>
  <view class="demo-card" border="~ solid gray-200 dark:gray-700 rounded-xl" p-4 mb-4 bg="white dark:gray-800" shadow-sm>
    <view flex items-center justify-between border="b solid gray-100 dark:gray-700" pb-2 mb-3>
      <view flex items-center gap-2>
        <text class="i-carbon-flow" text-emerald-600 text-lg />
        <text font-bold text-base text="gray-800 dark:gray-100">TreeDemo (递归组件与无限层级组件树)</text>
      </view>
      <button size="mini" bg="gray-200 dark:gray-700" text="xs gray-700 dark:gray-200" px-2 py-0.5 rounded @click="resetTree">
        重置树结构
      </button>
    </view>

    <view text-xs text-gray-500 mb-2>
      在 DevTools 的 Components 面板中，递归组件会生成深度树结构。可测试树节点折叠展开、过滤搜索、路径定位及动态添加/删除节点时的高亮更新。
    </view>

    <TreeNode :node="treeData" :depth="0" />
  </view>
</template>
