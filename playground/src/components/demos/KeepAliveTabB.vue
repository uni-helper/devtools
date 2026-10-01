<script setup lang="ts">
import { onActivated, onDeactivated, onMounted, ref } from 'vue'

defineOptions({
  name: 'KeepAliveTabB',
})

const items = ref([
  { id: 1, name: '任务 1：测试 Props 检视', done: true },
  { id: 2, name: '任务 2：测试 Listeners 警告', done: false },
  { id: 3, name: '任务 3：测试 KeepAlive 缓存', done: true },
])

const statusB = ref('mounted')

onMounted(() => {
  statusB.value = 'mounted'
})

onActivated(() => {
  statusB.value = 'activated'
})

onDeactivated(() => {
  statusB.value = 'deactivated'
})

function toggle(id: number) {
  const item = items.value.find((i) => i.id === id)
  if (item) item.done = !item.done
}
</script>

<template>
  <view border="~ solid blue-200 dark:blue-800 rounded-lg" p-3 bg="blue-50/40 dark:blue-950/30" text-xs>
    <view flex items-center justify-between mb-2>
      <text font-bold text-blue-700 dark:blue-300>📋 KeepAliveTabB (被缓存的 Tab B 任务列表)</text>
      <text px-2 py-0.5 rounded text="10px blue-600 bg-blue-100 dark:bg-blue-900 font-mono">
        Status: {{ statusB }}
      </text>
    </view>

    <view flex flex-col gap-1.5>
      <view
        v-for="item in items"
        :key="item.id"
        flex items-center justify-between p="x-2 y-1"
        rounded bg="white dark:gray-800"
        cursor-pointer
        @click="toggle(item.id)"
      >
        <text :class="item.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-200'">
          {{ item.name }}
        </text>
        <text text-xs :class="item.done ? 'text-emerald-500' : 'text-gray-400'">
          {{ item.done ? '✓ 已完成' : '○ 待办' }}
        </text>
      </view>
    </view>
  </view>
</template>
