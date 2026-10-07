<script setup lang="ts">
// Vue 3.4+ defineModel 宏语法测试
// 1. 默认 modelValue
const modelValue = defineModel<string>({
  default: '',
})

// 2. 具名 model: count
const count = defineModel<number>('count', {
  default: 0,
})

// 3. 具名 model 带修饰符与 getter/setter 自定义处理: title
const [title, titleModifiers] = defineModel<string>('title', {
  default: 'Default Title',
  set(val: string) {
    if (titleModifiers.capitalize && val) {
      return val.charAt(0).toUpperCase() + val.slice(1)
    }
    return val
  },
})

// 4. 布尔开关 model: active
const active = defineModel<boolean>('active', {
  default: false,
})

function handleInc() {
  count.value++
}

function handleDec() {
  count.value--
}

function handleToggleActive() {
  active.value = !active.value
}
</script>

<template>
  <view class="demo-card" border="~ solid gray-200 dark:gray-700 rounded-xl" p-4 mb-4 bg="white dark:gray-800" shadow-sm>
    <view flex items-center justify-between border="b solid gray-100 dark:gray-700" pb-2 mb-3>
      <view flex items-center gap-2>
        <text class="i-carbon-arrows-horizontal" text-amber-600 text-lg />
        <text font-bold text-base text="gray-800 dark:gray-100">ModelTwoWayDemo (v-model & defineModel 双向绑定)</text>
      </view>
      <text text-xs px-2 py-0.5 rounded bg="amber-50 dark:amber-900" text="amber-600 dark:amber-300">
        Vue 3.4+ defineModel
      </text>
    </view>

    <!-- 子组件内部输入与状态展示 -->
    <view flex flex-col gap-3 text-xs>
      <!-- 1. 默认 v-model 文本输入 -->
      <view>
        <view flex items-center justify-between mb-1>
          <text text-gray-500 font-semibold>1. 默认 v-model (modelValue):</text>
          <text font-mono text-amber-600 font-bold>{{ modelValue || '(empty)' }}</text>
        </view>
        <input
          v-model="modelValue"
          placeholder="在子组件修改 v-model..."
          border="~ solid gray-300 dark:gray-600 rounded"
          p="x-2 y-1.5"
          bg="gray-50 dark:gray-900"
          text-xs
        >
      </view>

      <!-- 2. 具名 v-model:count -->
      <view flex items-center justify-between bg="gray-50 dark:gray-900" p-2 rounded-lg>
        <view>
          <text text-gray-500 font-semibold>2. 具名 v-model:count: </text>
          <text font-mono text-blue-600 font-bold text-sm ml-1>{{ count }}</text>
        </view>
        <view flex items-center gap-2>
          <button size="mini" px-2 py-0.5 rounded bg="gray-200 dark:gray-700" text-xs @click="handleDec">-1</button>
          <button size="mini" px-2 py-0.5 rounded bg="blue-600 text-white" text-xs @click="handleInc">+1</button>
        </view>
      </view>

      <!-- 3. 具名 v-model:title.capitalize 修饰符 -->
      <view>
        <view flex items-center justify-between mb-1>
          <text text-gray-500 font-semibold>3. 具名 v-model:title.capitalize (首字母大写修饰符):</text>
          <text font-mono text-purple-600 font-bold>{{ title }}</text>
        </view>
        <input
          v-model="title"
          placeholder="输入小写测试 capitalize 修饰符..."
          border="~ solid gray-300 dark:gray-600 rounded"
          p="x-2 y-1.5"
          bg="gray-50 dark:gray-900"
          text-xs
        >
      </view>

      <!-- 4. 具名 v-model:active 开关 -->
      <view flex items-center justify-between bg="gray-50 dark:gray-900" p-2 rounded-lg>
        <view>
          <text text-gray-500 font-semibold>4. 具名 v-model:active (开关状态): </text>
          <text font-mono font-bold ml-1 :class="active ? 'text-emerald-500' : 'text-gray-400'">
            {{ String(active) }}
          </text>
        </view>
        <button
          size="mini"
          px-3 py-1 rounded text-xs text-white
          :class="active ? 'bg-emerald-600' : 'bg-gray-400'"
          @click="handleToggleActive"
        >
          切换 Active
        </button>
      </view>
    </view>
  </view>
</template>
