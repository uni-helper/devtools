<script setup lang="ts">
import { reactive, ref } from 'vue'

const count = ref(42)
const status = ref<'idle' | 'running' | 'paused'>('running')
const internalSecret = ref('SECRET_KEY_DEVTOOLS_8899')

const metaInfo = reactive({
  buildTime: new Date().toLocaleTimeString(),
  calls: 0,
})

function increment() {
  count.value += 5
  metaInfo.calls++
}

function resetCount() {
  count.value = 0
  metaInfo.calls++
}

function setStatus(newStatus: 'idle' | 'running' | 'paused') {
  status.value = newStatus
  metaInfo.calls++
}

function getSnapshot() {
  return {
    count: count.value,
    status: status.value,
    secret: internalSecret.value,
    meta: { ...metaInfo },
  }
}

// 显式向外暴露属性与方法（测试 DevTools 对组件 refs 和暴露实例的检视能力）
defineExpose({
  count,
  status,
  metaInfo,
  internalSecret,
  increment,
  resetCount,
  setStatus,
  getSnapshot,
})
</script>

<template>
  <view border="~ solid emerald-200 dark:emerald-800 rounded-lg" p-3 bg="emerald-50/40 dark:emerald-950/30" text-xs>
    <view flex items-center justify-between mb-2>
      <text font-bold text-emerald-800 dark:emerald-200>🎯 ExposeRefsDemo (Child 暴露实例与状态)</text>
      <text px-2 py-0.5 rounded text="10px emerald-600 bg-emerald-100 dark:bg-emerald-900">defineExpose</text>
    </view>

    <view grid grid-cols-2 gap-2 font-mono text="11px text-gray-700 dark:text-gray-300" mb-3>
      <view>count: <text font-bold text-emerald-600>{{ count }}</text></view>
      <view>status: <text font-bold text-blue-600>{{ status }}</text></view>
      <view>calls: {{ metaInfo.calls }}</view>
      <view truncate>secret: {{ internalSecret }}</view>
    </view>

    <view flex gap-2>
      <button size="mini" bg="emerald-600 text-white" px-2.5 py-1 rounded text-xs @click="increment">
        Child 自增 (+5)
      </button>
      <button size="mini" bg="gray-500 text-white" px-2.5 py-1 rounded text-xs @click="resetCount">
        Child 重置
      </button>
    </view>
  </view>
</template>
