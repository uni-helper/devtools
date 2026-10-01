<script setup lang="ts">
import { getCurrentInstance } from 'vue'

export interface SubmitPayload {
  id: number
  message: string
  timestamp: number
  meta: {
    source: string
    severity: 'info' | 'warn' | 'error'
  }
}

// 显式声明的事件类型（DevTools 中的 Listeners 会识别为 Declared）
const emit = defineEmits<{
  (e: 'customSubmit', payload: SubmitPayload): void
  (e: 'countChange', nextCount: number): void
  (e: 'reset'): void
}>()

const instance = getCurrentInstance()

const innerCount = ref(1)

function handleEmitSubmit() {
  emit('customSubmit', {
    id: Date.now(),
    message: 'DevTools 事件测试成功！',
    timestamp: Date.now(),
    meta: {
      source: 'EventsEmitsDemo.vue',
      severity: 'info',
    },
  })
}

function handleEmitCount() {
  innerCount.value++
  emit('countChange', innerCount.value)
}

function handleEmitReset() {
  innerCount.value = 0
  emit('reset')
}

// 触发未在 emits 中声明的事件（DevTools 将标记为 Not declared 并提示泄漏到 attrs 中）
function handleEmitUndeclared() {
  if (instance) {
    instance.emit('undeclared-event', {
      warning: 'This event was emitted without being declared in defineEmits!',
      time: new Date().toISOString(),
    })
  }
}
</script>

<template>
  <view class="demo-card" border="~ solid gray-200 dark:gray-700 rounded-xl" p-4 mb-4 bg="white dark:gray-800" shadow-sm>
    <view flex items-center justify-between border="b solid gray-100 dark:gray-700" pb-2 mb-3>
      <view flex items-center gap-2>
        <text class="i-carbon-flash" text-rose-500 text-lg />
        <text font-bold text-base text="gray-800 dark:gray-100">EventsEmitsDemo (Declared 与 Undeclared 事件监听)</text>
      </view>
      <text text-xs px-2 py-0.5 rounded bg="rose-50 dark:rose-900" text="rose-600 dark:rose-300">
        DevTools Listeners & Emits
      </text>
    </view>

    <view text-xs text-gray-500 mb-3 leading-relaxed>
      本组件用于测试 DevTools 面板中 <text font-mono font-bold text-rose-600>Listeners</text> 标签页对组件监听器的识别能力：
      Declared（已在 defineEmits 声明）与 Not Declared（未声明事件泄漏警告）。
    </view>

    <!-- 操作按钮组 -->
    <view flex flex-wrap gap-2>
      <button
        size="mini"
        bg="rose-600 hover:rose-700 text-white"
        px-3 py-1.5 rounded text-xs
        @click="handleEmitSubmit"
      >
        触发 customSubmit (复杂 Payload)
      </button>

      <button
        size="mini"
        bg="blue-600 hover:blue-700 text-white"
        px-3 py-1.5 rounded text-xs
        @click="handleEmitCount"
      >
        触发 countChange (Count: {{ innerCount }})
      </button>

      <button
        size="mini"
        bg="gray-600 hover:gray-700 text-white"
        px-3 py-1.5 rounded text-xs
        @click="handleEmitReset"
      >
        触发 reset (无 Payload)
      </button>

      <button
        size="mini"
        bg="amber-600 hover:amber-700 text-white"
        px-3 py-1.5 rounded text-xs
        @click="handleEmitUndeclared"
      >
        ⚠️ 触发未声明事件 (undeclared-event)
      </button>
    </view>
  </view>
</template>
