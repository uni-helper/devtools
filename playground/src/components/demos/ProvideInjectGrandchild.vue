<script setup lang="ts">
import { inject, type Ref } from 'vue'
import { THEME_KEY, USER_INFO_KEY, SYMBOL_KEY, type UserProfile } from '@/utils/keys'

// 跨层级注入来自 Parent 的值
const theme = inject(THEME_KEY, ref('light') as Ref<'light' | 'dark'>)
const userInfo = inject(USER_INFO_KEY, null as UserProfile | null)
const symbolVal = inject(SYMBOL_KEY, 'Fallback Symbol Value')
const updateTheme = inject<() => void>('updateTheme')
const grandparentMessage = inject<string>('grandparentMessage', 'No Grandparent Message')

// 注入来自中间层 Child 的值
const childMessage = inject<string>('childMessage', 'No Child Message')

// 注入不存在的 Key 并提供 Fallback 默认值（测试 DevTools 显示）
const fallbackProp = inject<string>('nonExistentKey', '这是注入不存在键时的 Fallback 默认值')

function handleToggle() {
  if (updateTheme) {
    updateTheme()
  } else {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
  }
}
</script>

<template>
  <view border="~ solid purple-300 dark:purple-700 rounded-lg" p-3 bg="purple-50/50 dark:purple-950/40" text-xs>
    <view flex items-center justify-between mb-2>
      <text font-bold text-purple-700 dark:purple-300>👶 ProvideInjectGrandchild (孙组件层级)</text>
      <text px-2 py-0.5 rounded text="10px purple-600 bg-purple-100 dark:bg-purple-900">Level 3</text>
    </view>

    <view flex flex-col gap-1.5 font-mono text="11px">
      <view>
        <text text-gray-500>Injected Theme (Ref): </text>
        <text font-bold :class="theme === 'dark' ? 'text-indigo-400' : 'text-amber-600'">{{ theme }}</text>
      </view>
      <view v-if="userInfo">
        <text text-gray-500>Injected UserInfo: </text>
        <text text-purple-600 font-bold>{{ userInfo.name }}</text>
        <text text-gray-400> ({{ userInfo.role }}, Lv.{{ userInfo.level }})</text>
      </view>
      <view>
        <text text-gray-500>Injected SymbolKey: </text>
        <text text-teal-600 truncate block>{{ symbolVal }}</text>
      </view>
      <view>
        <text text-gray-500>Injected GrandparentMsg: </text>
        <text text-gray-700 dark:text-gray-300>{{ grandparentMessage }}</text>
      </view>
      <view>
        <text text-gray-500>Injected ChildMsg: </text>
        <text text-blue-600>{{ childMessage }}</text>
      </view>
      <view>
        <text text-gray-500>Fallback Injection: </text>
        <text text-gray-400 italic>{{ fallbackProp }}</text>
      </view>
    </view>

    <view mt-3 pt-2 border="t dashed purple-200 dark:purple-800" flex justify-end>
      <button
        size="mini"
        bg="purple-600 hover:purple-700 text-white"
        px-3 py-1 rounded text-xs
        @click="handleToggle"
      >
        孙组件触发: updateTheme()
      </button>
    </view>
  </view>
</template>
