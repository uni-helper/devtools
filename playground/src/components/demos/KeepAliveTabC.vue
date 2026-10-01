<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

defineOptions({
  name: 'KeepAliveTabC',
})

const mountTimestamp = ref(new Date().toLocaleTimeString())
const randomSeed = ref(Math.floor(Math.random() * 10000))

onMounted(() => {
  console.log('[KeepAliveTabC] Mounted!')
})

onUnmounted(() => {
  console.log('[KeepAliveTabC] Unmounted!')
})
</script>

<template>
  <view border="~ solid gray-300 dark:gray-700 rounded-lg" p-3 bg="gray-100/50 dark:gray-800/50" text-xs>
    <view flex items-center justify-between mb-2>
      <text font-bold text-gray-700 dark:text-gray-300>⚡ KeepAliveTabC (未被缓存的 Tab - 每次切回均重新挂载)</text>
      <text px-2 py-0.5 rounded text="10px gray-500 bg-gray-200 dark:bg-gray-700">No Cache</text>
    </view>

    <view font-mono text="11px text-gray-500">
      <view>挂载时间 (每次重新计算): {{ mountTimestamp }}</view>
      <view>随机数 (每次切回刷新): {{ randomSeed }}</view>
    </view>
  </view>
</template>
