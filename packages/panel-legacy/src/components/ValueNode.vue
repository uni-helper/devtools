<script setup lang="ts">
import { computed, ref } from 'vue'
import { valueColor } from '../constants/value-colors'

/**
 * 值的递归展示。原语直接渲染；对象/数组折叠为单行摘要，点击展开逐键递归。
 *
 * 用色刻意只落在共享设计词汇里（键 `color-muted`、字符串
 * `color-status-positive`、空值 `op-mute`），不另起一套取色——组件树的
 * 主色调由主题与徽标承担，这里保持克制。
 */
const props = withDefaults(defineProps<{
  value: unknown
  /** 数组下标等展示用键名（可省）。 */
  name?: string
  depth?: number
}>(), { depth: 0 })

const open = ref(props.depth < 1)

const isPrimitive = computed(() => {
  const v = props.value
  return v === null || v === undefined || typeof v !== 'object'
})

const entries = computed<Array<[string, unknown]>>(() => {
  const v = props.value
  if (Array.isArray(v))
    return v.map((item, i) => [String(i), item] as [string, unknown])
  if (v && typeof v === 'object')
    return Object.entries(v as Record<string, unknown>)
  return []
})

const preview = computed(() => {
  const v = props.value
  if (Array.isArray(v))
    return `Array(${v.length})`
  if (v && typeof v === 'object') {
    const n = Object.keys(v as Record<string, unknown>).length
    return n === 0 ? '{}' : `{${n}}`
  }
  return undefined
})

const formatted = computed(() => {
  const v = props.value
  if (v === null || v === undefined)
    return 'null'
  if (typeof v === 'string')
    return `"${v}"`
  return String(v)
})

const isEmpty = computed(() => props.value === null || props.value === undefined)
// 值类型语法色（对齐旧版 stateColorMap / Vue Devtools 惯例），对象/数组保持中性色。
const valueStyle = computed(() => {
  if (isEmpty.value)
    return undefined
  const color = valueColor(props.value)
  return color ? { color } : undefined
})
</script>

<template>
  <span class="min-w-0 inline-flex items-baseline gap-1.5 font-mono text-xs">
    <span v-if="name !== undefined" class="op-mute shrink-0">{{ name }}:</span>

    <template v-if="isPrimitive">
      <span
        class="break-all"
        :class="isEmpty ? 'op-mute italic' : 'color-base'"
        :style="valueStyle"
      >{{ formatted }}</span>
    </template>

    <template v-else>
      <button
        class="cursor-pointer rounded px-0.5 -mx-0.5 hover:bg-active shrink-0"
        :aria-expanded="open"
        @click.stop="open = !open"
      >
        <span class="inline-flex items-center gap-0.5">
          <span class="text-[10px] op-mute" :class="open ? 'i-ph:caret-down' : 'i-ph:caret-right'" />
          <span class="color-base">{{ preview }}</span>
        </span>
      </button>
      <div v-if="open" class="flex flex-col items-start gap-0.5 pl-3 ml-1 border-l border-base">
        <ValueNode
          v-for="[key, child] in entries"
          :key="key"
          :name="key"
          :value="child"
          :depth="depth + 1"
        />
      </div>
    </template>
  </span>
</template>
