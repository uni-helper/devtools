<script setup lang="ts">
import { computed } from 'vue'

export interface NestedAddress {
  city: string
  province: string
  coordinates?: {
    lat: number
    lng: number
  }
}

export interface UserItem {
  id: number
  name: string
  role: string
  address: NestedAddress
  scores: number[]
}

export interface ListItem {
  id: number
  title: string
  status: 'pending' | 'success' | 'failed'
}

// 采用 TypeScript 泛型 + withDefaults 声明 Props
const props = withDefaults(
  defineProps<{
    // 基础类型
    title: string
    count?: number
    disabled?: boolean
    remark?: string | null

    // 复杂嵌套对象
    user: UserItem

    // 数组类型
    tags?: string[]
    list?: ListItem[]

    // 特殊 JS 类型
    callback?: (val: string) => string
    createdAt?: Date
    pattern?: RegExp
    metaMap?: Map<string, any>
    uniqueSet?: Set<any>
    symbolId?: symbol

    // 驼峰命名属性（用于测试模板 kebab-case 自动映射）
    kebabPropName?: string

    // 未传值的可选属性（测试 DevTools 显示 undefined / 默认值）
    optionalUnsetProp?: string
  }>(),
  {
    count: 10,
    disabled: false,
    remark: null,
    tags: () => ['Vue3', 'UniApp', 'DevTools'],
    list: () => [
      { id: 1, title: '初始化工程', status: 'success' },
      { id: 2, title: '组件调试', status: 'pending' },
    ],
    callback: () => (val: string) => `[Default Callback: ${val}]`,
    createdAt: () => new Date(),
    pattern: () => /^devtools-[a-z0-9]+$/i,
    metaMap: () => new Map([['framework', 'uni-app'], ['tool', 'devtools']]),
    uniqueSet: () => new Set([100, 200, 300]),
    symbolId: () => Symbol('default-symbol'),
    kebabPropName: 'default-kebab-value',
  }
)

const emit = defineEmits<{
  (e: 'callbackTriggered', result: string): void
}>()

// 衍生计算属性，用来测试 props 变化时在 DevTools 中的响应式图谱
const formattedInfo = computed(() => {
  return `${props.title} (Count: ${props.count}) - User: ${props.user.name} @ ${props.user.address.city}`
})

const callbackResult = ref('')

function handleRunCallback() {
  if (props.callback) {
    const res = props.callback('Hello from PropsBasicDemo Child!')
    callbackResult.value = res
    emit('callbackTriggered', res)
  }
}
</script>

<template>
  <view class="demo-card" border="~ solid gray-200 dark:gray-700 rounded-xl" p-4 mb-4 bg="white dark:gray-800" shadow-sm>
    <view flex items-center justify-between border="b solid gray-100 dark:gray-700" pb-2 mb-3>
      <view flex items-center gap-2>
        <text class="i-carbon-box" text-teal-600 text-lg />
        <text font-bold text-base text="gray-800 dark:gray-100">PropsBasicDemo (Props 基础与全类型测试)</text>
      </view>
      <text text-xs px-2 py-0.5 rounded bg="teal-50 dark:teal-900" text="teal-600 dark:teal-300">
        TypeScript withDefaults
      </text>
    </view>

    <!-- 基础类型展示 -->
    <view grid grid-cols-2 gap-2 text-xs mb-3 bg="gray-50 dark:gray-900" p-2.5 rounded-lg>
      <view>
        <text text-gray-400>title (string): </text>
        <text font-mono font-bold text-teal-600>{{ props.title }}</text>
      </view>
      <view>
        <text text-gray-400>count (number): </text>
        <text font-mono font-bold text-blue-600>{{ props.count }}</text>
      </view>
      <view>
        <text text-gray-400>disabled (boolean): </text>
        <text font-mono font-bold :class="props.disabled ? 'text-red-500' : 'text-emerald-500'">
          {{ String(props.disabled) }}
        </text>
      </view>
      <view>
        <text text-gray-400>remark (null/string): </text>
        <text font-mono text-gray-500>{{ props.remark === null ? 'null' : props.remark }}</text>
      </view>
      <view>
        <text text-gray-400>kebabPropName: </text>
        <text font-mono text-purple-600>{{ props.kebabPropName }}</text>
      </view>
      <view>
        <text text-gray-400>optionalUnsetProp: </text>
        <text font-mono text-gray-400>{{ String(props.optionalUnsetProp) }}</text>
      </view>
    </view>

    <!-- 复杂嵌套对象展示（深度对象在 DevTools 里支持多层折叠展开） -->
    <view mb-3 text-xs>
      <text font-semibold text-gray-600 dark:text-gray-300 mb-1 block>深度嵌套对象 props.user:</text>
      <view p-2 bg="gray-50 dark:gray-900" rounded-lg font-mono text="11px gray-700 dark:gray-300">
        <view>id: {{ props.user.id }} | name: {{ props.user.name }} ({{ props.user.role }})</view>
        <view>province: {{ props.user.address.province }} / city: {{ props.user.address.city }}</view>
        <view v-if="props.user.address.coordinates">
          coordinates: [{{ props.user.address.coordinates.lat }}, {{ props.user.address.coordinates.lng }}]
        </view>
        <view>scores: {{ JSON.stringify(props.user.scores) }}</view>
      </view>
    </view>

    <!-- 数组与特殊类型展示 -->
    <view mb-3 text-xs>
      <text font-semibold text-gray-600 dark:text-gray-300 mb-1 block>数组与复杂 JS 类型:</text>
      <view flex flex-wrap gap-1.5 mb-2>
        <text
          v-for="tag in props.tags"
          :key="tag"
          px-2 py-0.5 rounded-full text="10px teal-700 dark:teal-200"
          bg="teal-100 dark:teal-800"
        >
          #{{ tag }}
        </text>
      </view>

      <view grid grid-cols-2 gap-2 text="11px gray-600 dark:gray-400" bg="gray-50 dark:gray-900" p-2 rounded-lg font-mono>
        <view>createdAt: {{ props.createdAt ? props.createdAt.toLocaleTimeString() : 'N/A' }}</view>
        <view>pattern: {{ String(props.pattern) }}</view>
        <view>metaMap Size: {{ props.metaMap?.size ?? 0 }}</view>
        <view>uniqueSet Size: {{ props.uniqueSet?.size ?? 0 }}</view>
      </view>
    </view>

    <!-- 函数 Prop 交互测试 -->
    <view border="t solid gray-100 dark:gray-700" pt-2.5 flex items-center justify-between gap-2>
      <view text-xs truncate flex-1>
        <text text-gray-400>Callback 结果: </text>
        <text text-teal-600 font-mono>{{ callbackResult || '尚未触发' }}</text>
      </view>
      <button
        size="mini"
        text="xs white"
        bg="teal-600 hover:teal-700"
        px-3 py-1 rounded
        @click="handleRunCallback"
      >
        测试执行 props.callback
      </button>
    </view>
  </view>
</template>
