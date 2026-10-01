<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayFilePath from '@antfu/design/components/Display/DisplayFilePath.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackSpinner from '@antfu/design/components/Feedback/FeedbackSpinner.vue'
import FeedbackTip from '@antfu/design/components/Feedback/FeedbackTip.vue'
import FormSearchField from '@antfu/design/components/Form/FormSearchField.vue'
import { computed, ref } from 'vue'
import { inspector } from '../state/inspector'
import StateSection from './StateSection.vue'

const { selectedId, selectedNode, selectedState, stateLoading, stateError, reloadState } = inspector

/** 页面型合成节点（采集失败占位行）在原始树里找不到，用状态名兜底。 */
const displayName = computed(() =>
  selectedNode.value?.name ?? selectedState.value?.name ?? selectedId.value ?? '',
)

/** 状态键过滤（对齐 Vue Devtools 的 Filter State…）。 */
const stateFilter = ref('')

function matchesFilter(key: string): boolean {
  const q = stateFilter.value.trim().toLowerCase()
  return !q || key.toLowerCase().includes(q)
}

const setupFields = computed(() =>
  Object.entries(selectedState.value?.setup ?? {})
    .map(([key, field]) => ({ key, kind: field.type, value: field.value }))
    .filter(field => matchesFilter(field.key)),
)

const dataFields = computed(() =>
  Object.entries(selectedState.value?.data ?? {})
    .map(([key, value]) => ({ key, kind: 'data' as const, value }))
    .filter(field => matchesFilter(field.key)),
)
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <FeedbackEmptyState
      v-if="!selectedId"
      icon="i-ph:cursor-click-duotone"
      class="flex-1 justify-center"
    >
      <template #default>
        选择一个组件
      </template>
      <template #hint>
        在左侧组件树中点选任意组件，查看并编辑它的状态。
      </template>
    </FeedbackEmptyState>

    <template v-else>
      <div class="flex items-center gap-2 h-8 px-3 border-b border-base bg-secondary shrink-0">
        <span class="font-mono text-xs font-semibold truncate shrink-0" :title="displayName">
          <span class="op-mute">&lt;</span>{{ displayName }}<span class="op-mute">&gt;</span>
        </span>
        <span
          v-if="selectedNode?.type === 'page'"
          class="badge badge-color-violet text-[10px] shrink-0"
        >page</span>
        <FormSearchField
          v-model="stateFilter"
          placeholder="Filter State…"
          size="sm"
          class="flex-1 min-w-0"
        />
        <FeedbackSpinner v-if="stateLoading" class="text-xs shrink-0" />
        <ActionIconButton
          icon="i-ph:arrow-clockwise"
          tooltip="重新读取状态"
          label="重新读取状态"
          :disabled="stateLoading"
          @click="reloadState(selectedId!)"
        />
      </div>

      <div v-if="selectedNode?.file" class="px-3 py-1.5 border-b border-base shrink-0 min-w-0">
        <DisplayFilePath
          :path="selectedNode.file"
          icon
          dim
          class="text-xs"
        />
      </div>

      <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-3">
        <FeedbackTip v-if="stateError" type="error" icon="i-ph:warning-duotone">
          <div class="font-medium">
            状态读取失败
          </div>
          <div class="text-xs font-mono break-all op-mute">
            {{ stateError.message }}
          </div>
        </FeedbackTip>

        <StateSection
          v-if="setupFields.length > 0"
          title="Setup"
          hint="setupState · ref 读取时已解包"
          :component-id="selectedId!"
          :fields="setupFields"
        />
        <StateSection
          v-if="dataFields.length > 0"
          title="Data"
          hint="$data"
          :component-id="selectedId!"
          :fields="dataFields"
        />

        <FeedbackEmptyState
          v-if="!stateLoading && !stateError && setupFields.length === 0 && dataFields.length === 0"
          icon="i-ph:hash-duotone"
        >
          <template #default>
            该组件没有可展示的状态
          </template>
          <template #hint>
            探针会跳过以 _ / $ 开头的键以及函数类型的绑定。
          </template>
        </FeedbackEmptyState>
      </div>
    </template>
  </div>
</template>
