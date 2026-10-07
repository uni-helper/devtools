<script setup lang="ts">
import {
  computed,
  reactive,
  readonly,
  ref,
  shallowReactive,
  shallowRef,
  triggerRef,
} from 'vue'

// 1. 标准 ref
const count = ref(10)
const text = ref('Vue DevTools')

// 2. 深度 reactive
const userProfile = reactive({
  name: 'Code Master',
  age: 28,
  address: {
    city: 'Shenzhen',
    street: 'Hi-Tech Park',
  },
})

// 3. shallowRef（修改内部属性不触发更新，需 triggerRef 或整值赋值）
const shallowConfig = shallowRef({
  version: '2.0.0',
  mode: 'production',
})

// 4. shallowReactive
const shallowState = shallowReactive({
  topLevelCount: 1,
  nested: {
    deeperCount: 100,
  },
})

// 5. readonly
const readonlyCount = readonly(count)

// 6. 普通只读 computed
const doubleCount = computed(() => count.value * 2)
const summaryText = computed(() => {
  return `${userProfile.name} (${userProfile.age}) lives in ${userProfile.address.city}, count=${count.value}`
})

// 7. 可写 computed（特别关键：DevTools 的 Computed 检视面板会识别 set 方法并允许直接在线编辑修改！）
const firstName = ref('尤')
const lastName = ref('小右')

const fullName = computed({
  get: () => `${firstName.value} ${lastName.value}`,
  set: (newVal: string) => {
    const parts = newVal.trim().split(/\s+/)
    firstName.value = parts[0] || ''
    lastName.value = parts.slice(1).join(' ') || ''
  },
})

function mutateShallowInner() {
  // 不会触发响应式
  shallowConfig.value.version = `2.0.${Math.floor(Math.random() * 100)}`
}

function doTriggerRef() {
  // 手动触发 shallowRef 响应
  triggerRef(shallowConfig)
}

function replaceShallow() {
  // 整值赋新对象，触发响应
  shallowConfig.value = {
    version: `3.0.${Math.floor(Math.random() * 10)}`,
    mode: 'development',
  }
}
</script>

<template>
  <view class="demo-card" border="~ solid gray-200 dark:gray-700 rounded-xl" p-4 mb-4 bg="white dark:gray-800" shadow-sm>
    <view flex items-center justify-between border="b solid gray-100 dark:gray-700" pb-2 mb-3>
      <view flex items-center gap-2>
        <text class="i-carbon-chart-bubble" text-sky-500 text-lg />
        <text font-bold text-base text="gray-800 dark:gray-100">ReactivityFullDemo (响应式全家桶与可写计算属性)</text>
      </view>
      <text text-xs px-2 py-0.5 rounded bg="sky-50 dark:sky-900" text="sky-600 dark:sky-300">
        Reactivity Graph & Writable Computed
      </text>
    </view>

    <!-- 1. Ref & Computed -->
    <view mb-3 bg="gray-50 dark:gray-900" p-2.5 rounded-lg text-xs>
      <text font-semibold text-gray-700 dark:text-gray-300 mb-1.5 block>1. Ref & Computed:</text>
      <view grid grid-cols-2 gap-2 font-mono text="11px">
        <view>count: <text font-bold text-sky-600>{{ count }}</text></view>
        <view>doubleCount: <text font-bold text-indigo-600>{{ doubleCount }}</text></view>
        <view>readonlyCount: <text text-gray-500>{{ readonlyCount }}</text></view>
        <view truncate>text: {{ text }}</view>
      </view>
      <view flex gap-2 mt-2>
        <button size="mini" bg="sky-600 text-white" px-2.5 py-0.5 rounded text-xs @click="count++">+1</button>
        <button size="mini" bg="gray-500 text-white" px-2.5 py-0.5 rounded text-xs @click="count--">-1</button>
      </view>
    </view>

    <!-- 2. 可写 Computed (测试在 DevTools 中直接编辑) -->
    <view mb-3 bg="gray-50 dark:gray-900" p-2.5 rounded-lg text-xs>
      <view flex items-center justify-between mb-1.5>
        <text font-semibold text-gray-700 dark:text-gray-300>2. 可写 Computed (fullName = get + set):</text>
        <text font-mono font-bold text-purple-600>{{ fullName }}</text>
      </view>
      <input
        v-model="fullName"
        placeholder="输入 'First Last' 测试计算属性 setter..."
        border="~ solid gray-300 dark:gray-600 rounded"
        p="x-2 y-1"
        bg="white dark:gray-800"
        text-xs
        mb-1.5
      >
      <view font-mono text="11px text-gray-500">
        firstName: <text text-purple-500 font-bold>{{ firstName }}</text> |
        lastName: <text text-purple-500 font-bold>{{ lastName }}</text>
      </view>
    </view>

    <!-- 3. shallowRef & triggerRef -->
    <view mb-3 bg="gray-50 dark:gray-900" p-2.5 rounded-lg text-xs>
      <view flex items-center justify-between mb-1.5>
        <text font-semibold text-gray-700 dark:text-gray-300>3. shallowRef & triggerRef:</text>
        <text font-mono text="11px text-sky-600">{{ shallowConfig.version }} ({{ shallowConfig.mode }})</text>
      </view>
      <view flex flex-wrap gap-2>
        <button size="mini" bg="amber-600 text-white" px-2 py-0.5 rounded text-xs @click="mutateShallowInner">
          静默修改属性 (无响应)
        </button>
        <button size="mini" bg="emerald-600 text-white" px-2 py-0.5 rounded text-xs @click="doTriggerRef">
          triggerRef 手动触发
        </button>
        <button size="mini" bg="blue-600 text-white" px-2 py-0.5 rounded text-xs @click="replaceShallow">
          替换新对象
        </button>
      </view>
    </view>

    <!-- 4. 深度 summaryText (用于 DevTools 依赖图谱展示) -->
    <view text-xs p-2 bg="gray-50 dark:gray-900" rounded-lg>
      <text text-gray-400 block mb-1>多依赖汇总计算属性 summaryText (用于 DevTools 依赖图谱展示):</text>
      <text font-mono text="11px text-gray-700 dark:text-gray-300">{{ summaryText }}</text>
    </view>
  </view>
</template>
