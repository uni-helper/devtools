<script setup lang="ts">
// 递归组件：自己渲染自己，面板里应看到同名组件逐层嵌套。
// 必须显式 import 自身：mp 编译只把 import 进来的组件登记进 usingComponents，
// 只靠组件名自引用时子节点渲染不出来
import RecursiveNode from './RecursiveNode.vue'

export interface TreeNodeData {
  label: string
  children?: TreeNodeData[]
}

defineOptions({ name: 'RecursiveNode' })
defineProps<{ node: TreeNodeData, depth: number }>()
</script>

<template>
  <view>
    <view class="kv" :style="{ paddingLeft: `${depth * 12}px` }">
      {{ node.label }}
    </view>
    <view v-for="child in node.children" :key="child.label">
      <RecursiveNode :node="child" :depth="depth + 1" />
    </view>
  </view>
</template>
