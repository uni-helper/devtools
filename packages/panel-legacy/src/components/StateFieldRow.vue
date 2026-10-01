<script setup lang="ts">
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { inspector } from '../state/inspector'
import type { StateField } from './types'
import ValueNode from './ValueNode.vue'

const props = defineProps<{
  field: StateField
  componentId: string
}>()

const { commitValue, commitMessage } = inspector

// ---- 分类徽标：色调与措辞跟 Vue Devtools 的心智模型对齐 ------------------
const KIND_META: Record<StateField['kind'], { label: string, color: string }> = {
  ref: { label: 'ref', color: 'violet' },
  object: { label: 'reactive', color: 'teal' },
  value: { label: 'value', color: 'sky' },
  data: { label: 'data', color: 'amber' },
}
const meta = computed(() => KIND_META[props.field.kind])

const isPrimitive = computed(() => {
  const v = props.field.value
  return v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
})

// ---- 行内编辑：点击值进入编辑；原语 Enter 提交 / Esc 还原；对象用
// JSON 文本域（mod+Enter 提交）。探针只支持顶层 key 写入，这是提交语义的
// 上限，不是面板偷懒。 ------------------------------------------------
const editing = ref(false)
const draft = ref('')
const isObjectEditing = ref(false)
// 两个互斥分支各用独立的 ref 名，再用 computed 收敛：共用一个 ref 名时，
// 旧分支卸载清理与新分支挂载赋值的时序在框架层没有保证（评审 P1-3 的防御
// 性修复），拆开后各自生命周期清晰互不干扰。
const textareaRef = useTemplateRef<HTMLTextAreaElement>('textareaRef')
const inputRef = useTemplateRef<HTMLInputElement>('inputRef')
const editor = computed(() => textareaRef.value ?? inputRef.value)
const parseError = ref<string | null>(null)

function startEdit(): void {
  const v = props.field.value
  isObjectEditing.value = !isPrimitive.value
  draft.value = isPrimitive.value
    ? v === null ? 'null' : String(v)
    : JSON.stringify(v, null, 2)
  parseError.value = null
  editing.value = true
  void nextTick(() => editor.value?.select())
}

function parseDraft(): unknown {
  const raw = draft.value
  if (!isObjectEditing.value) {
    // 原语输入按 JSON 解析，失败则按纯字符串处理（输入 3 得数字、输入
    // hello 得字符串，符合 DevTools 直觉）。
    try {
      return JSON.parse(raw)
    }
    catch {
      return raw
    }
  }
  try {
    return JSON.parse(raw)
  }
  catch (error) {
    parseError.value = (error as Error).message
    return undefined
  }
}

async function commit(): Promise<void> {
  parseError.value = null
  const value = parseDraft()
  if (value === undefined && parseError.value)
    return
  const ok = await commitValue(props.componentId, props.field.key, value)
  if (ok)
    editing.value = false
}

function cancel(): void {
  editing.value = false
  parseError.value = null
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancel()
    return
  }
  if (event.key === 'Enter') {
    // 对象文本域需要 mod+Enter 提交，普通 Enter 留给换行。
    if (isObjectEditing.value && !(event.metaKey || event.ctrlKey))
      return
    event.preventDefault()
    void commit()
  }
}

const committing = computed(() => inspector.isCommitting(props.componentId, props.field.key))
const errorMessage = computed(() => commitMessage(props.componentId, props.field.key))

// navigator.platform 已废弃，用 UA 兜底；这只是个快捷键提示，误判无实害。
const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)
</script>

<template>
  <div class="group flex items-start gap-2 px-2 py-0.5 rounded hover:bg-active min-w-0">
    <span class="font-mono text-xs color-muted truncate shrink-0" :title="field.key">{{ field.key }}</span>
    <DisplayBadge :text="meta.label" :color="meta.color" class="text-[10px] shrink-0" />

    <template v-if="editing">
      <div class="flex-1 min-w-0 flex flex-col gap-1">
        <textarea
          v-if="isObjectEditing"
          ref="textareaRef"
          v-model="draft"
          rows="4"
          spellcheck="false"
          class="w-full font-mono text-xs bg-base border border-base rounded px-2 py-1 outline-none focus-visible:border-active resize-y"
          @keydown="onKeydown"
        />
        <input
          v-else
          ref="inputRef"
          v-model="draft"
          type="text"
          spellcheck="false"
          class="w-full font-mono text-xs bg-base border border-base rounded px-2 py-0.5 outline-none focus-visible:border-active"
          @keydown="onKeydown"
        >
        <div v-if="parseError" class="text-xs text-error">
          {{ parseError }}
        </div>
        <div v-else-if="errorMessage" class="text-xs text-error">
          {{ errorMessage }}
        </div>
        <div v-else-if="isObjectEditing" class="text-[10px] op-mute">
          JSON 编辑 · {{ isMac ? '⌘' : 'Ctrl' }}+Enter 提交 · Esc 还原
        </div>
      </div>
    </template>

    <template v-else>
      <!-- 必须是普通容器而不是 <button>：ValueNode 内部还有展开/折叠按钮，
           HTML 禁止 button 嵌套交互元素，且内层点击会冒泡触发 startEdit，
           把「展开对象」变成「进入 JSON 编辑」并销毁整棵值树。 -->
      <div
        class="flex-1 min-w-0 text-left cursor-text rounded px-0.5 -mx-0.5"
        title="点击编辑（探针当前仅支持顶层键写入）"
        @click="startEdit"
      >
        <ValueNode :value="field.value" :depth="0" />
      </div>
      <span
        v-if="committing"
        class="i-ph:circle-notch animate-spin text-xs op-mute shrink-0 self-center"
        aria-hidden="true"
      />
    </template>
  </div>
</template>
