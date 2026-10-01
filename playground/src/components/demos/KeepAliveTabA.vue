<script setup lang="ts">
import { onActivated, onDeactivated, onMounted, ref } from 'vue'

defineOptions({
  name: 'KeepAliveTabA',
})

const countA = ref(1)
const textA = ref('Tab A 输入保留测试')
const statusA = ref('mounted')

onMounted(() => {
  statusA.value = 'mounted'
})

onActivated(() => {
  statusA.value = 'activated'
})

onDeactivated(() => {
  statusA.value = 'deactivated'
})
</script>

<template>
  <view border="~ solid orange-200 dark:orange-800 rounded-lg" p-3 bg="orange-50/40 dark:orange-950/30" text-xs>
    <view flex items-center justify-between mb-2>
      <text font-bold text-orange-700 dark:orange-300>📦 KeepAliveTabA (被缓存的 Tab A)</text>
      <text px-2 py-0.5 rounded text="10px orange-600 bg-orange-100 dark:bg-orange-900 font-mono">
        Status: {{ statusA }}
      </text>
    </view>

    <view flex flex-col gap-2>
      <view flex items-center justify-between>
        <text text-gray-600 dark:text-gray-300>计数器 (切走后再切回状态保持不变): </text>
        <view flex items-center gap-1.5>
          <text font-mono font-bold text-orange-600 text-sm>{{ countA }}</text>
          <button size="mini" bg="orange-600 text-white" px-2 py-0.5 rounded text-xs @click="countA++">+1</button>
        </view>
      </view>

      <view>
        <text text-gray-500 block mb-1>输入框 (切走再切回文字保留):</text>
        <input
          v-model="textA"
          border="~ solid gray-300 dark:gray-600 rounded"
          p="x-2 y-1"
          bg="white dark:gray-800"
          text-xs
        >
      </view>
    </view>
  </view>
</template>
