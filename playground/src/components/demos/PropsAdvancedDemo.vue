<script setup lang="ts">
import type { PropType } from 'vue'

export interface ThemeConfig {
  primaryColor: string
  borderRadius: number
  darkMode: boolean
}

// 采用 Vue 运行时 Props 对象定义语法（测试 DevTools 提取 required, type, validator, default 等元信息）
const props = defineProps({
  // 联合类型
  mixedId: {
    type: [String, Number] as PropType<string | number>,
    required: true,
  },

  // 必填项，无默认值
  label: {
    type: String,
    required: true,
  },

  // 自定义校验器
  status: {
    type: String as PropType<'idle' | 'running' | 'success' | 'warning' | 'error'>,
    default: 'idle',
    validator(value: string) {
      return ['idle', 'running', 'success', 'warning', 'error'].includes(value)
    },
  },

  // 对象工厂默认值
  theme: {
    type: Object as PropType<ThemeConfig>,
    default: () => ({
      primaryColor: '#0d9488',
      borderRadius: 8,
      darkMode: false,
    }),
  },

  // 布尔值与 Vue 的隐式类型转换测试
  // 注意：Vue 规定如果类型含 Boolean 且无显式传入，默认转换规则在 DevTools 中需准确捕获
  isCompact: {
    type: Boolean,
    default: false,
  },

  // 通过 v-bind 动态透传的扩展属性
  extraBadge: {
    type: String,
    default: '',
  },

  // 驼峰命名属性，在父级通过 kebab-case 传入
  customAttributeDemo: {
    type: String,
    default: 'camelCaseDefault',
  },
})

const statusColorMap = {
  idle: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
  error: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
}
</script>

<template>
  <view class="demo-card" border="~ solid gray-200 dark:gray-700 rounded-xl" p-4 mb-4 bg="white dark:gray-800" shadow-sm>
    <view flex items-center justify-between border="b solid gray-100 dark:gray-700" pb-2 mb-3>
      <view flex items-center gap-2>
        <text class="i-carbon-certificate-check" text-indigo-600 text-lg />
        <text font-bold text-base text="gray-800 dark:gray-100">PropsAdvancedDemo (运行时校验与高级特性)</text>
      </view>
      <text text-xs px-2 py-0.5 rounded bg="indigo-50 dark:indigo-900" text="indigo-600 dark:indigo-300">
        Runtime Options Definition
      </text>
    </view>

    <view grid grid-cols-2 gap-2 text-xs mb-3 bg="gray-50 dark:gray-900" p-2.5 rounded-lg>
      <view>
        <text text-gray-400>mixedId ([String, Number]): </text>
        <text font-mono font-bold text-indigo-600>{{ props.mixedId }} ({{ typeof props.mixedId }})</text>
      </view>
      <view>
        <text text-gray-400>label (required: true): </text>
        <text font-mono font-bold text-gray-800 dark:text-gray-100>{{ props.label }}</text>
      </view>
      <view flex items-center gap-1.5>
        <text text-gray-400>status (validator): </text>
        <text px-2 py-0.5 rounded text="10px" font-bold :class="statusColorMap[props.status] || statusColorMap.idle">
          {{ props.status }}
        </text>
      </view>
      <view>
        <text text-gray-400>isCompact (Boolean): </text>
        <text font-mono font-bold :class="props.isCompact ? 'text-emerald-500' : 'text-gray-400'">
          {{ String(props.isCompact) }}
        </text>
      </view>
      <view>
        <text text-gray-400>extraBadge (v-bind 透传): </text>
        <text font-mono text-amber-600>{{ props.extraBadge || '(none)' }}</text>
      </view>
      <view>
        <text text-gray-400>customAttributeDemo: </text>
        <text font-mono text-blue-500>{{ props.customAttributeDemo }}</text>
      </view>
    </view>

    <!-- 对象工厂默认值展示 -->
    <view text-xs>
      <text font-semibold text-gray-600 dark:text-gray-300 mb-1 block>props.theme (默认工厂对象):</text>
      <view p-2 bg="gray-50 dark:gray-900" rounded-lg font-mono text="11px" flex items-center justify-between>
        <view flex items-center gap-2>
          <view w-3 h-3 rounded-full :style="{ backgroundColor: props.theme.primaryColor }" />
          <text text-gray-700 dark:text-gray-300>{{ props.theme.primaryColor }} | Radius: {{ props.theme.borderRadius }}px</text>
        </view>
        <text text-gray-400>darkMode: {{ String(props.theme.darkMode) }}</text>
      </view>
    </view>
  </view>
</template>
