<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackTip from '@antfu/design/components/Feedback/FeedbackTip.vue'
import { inspector } from '../state/inspector'
import TreeRow from './TreeRow.vue'

const { rows, treeLoading, treeError, filterText, refreshTree } = inspector
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto" role="tree" aria-label="组件树">
    <FeedbackTip v-if="treeError" type="error" icon="i-ph:warning-duotone" class="m-3">
      <div class="font-medium">
        组件树加载失败
      </div>
      <div class="text-xs font-mono break-all op-mute">
        {{ treeError.message }}
      </div>
      <div class="mt-2">
        <ActionButton variant="action" @click="refreshTree">
          重试
        </ActionButton>
      </div>
    </FeedbackTip>

    <FeedbackEmptyState
      v-else-if="rows.length === 0 && !treeLoading"
      icon="i-ph:tree-structure-duotone"
    >
      <template #default>
        没有组件
      </template>
      <template #hint>
        <template v-if="filterText">
          没有匹配「{{ filterText }}」的组件，换个关键词试试。
        </template>
        <template v-else>
          小程序尚未上报组件树。确认探针已注入并在运行后，点刷新重试。
        </template>
      </template>
      <template #actions>
        <ActionButton variant="action" @click="refreshTree">
          刷新
        </ActionButton>
      </template>
    </FeedbackEmptyState>

    <div v-else>
      <TreeRow v-for="row in rows" :key="row.node.id" :row="row" />
    </div>
  </div>
</template>
