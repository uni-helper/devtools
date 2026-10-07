<script setup lang="ts">
import { provide, reactive, ref } from 'vue'
import {
  THEME_KEY,
  USER_INFO_KEY,
  SYMBOL_KEY,
  APP_CONFIG_KEY,
  type UserProfile,
} from '@/utils/keys'
import ProvideInjectChild from './ProvideInjectChild.vue'

// 1. Ref 类型提供
const theme = ref<'light' | 'dark'>('dark')
provide(THEME_KEY, theme)
provide('theme', theme) // 同时提供字符串 key 供 Options API 注入

// 2. 深度 Reactive 对象提供
const userInfo = reactive<UserProfile>({
  id: 8848,
  name: 'Antigravity Dev',
  role: 'Architect',
  skills: ['Vue3', 'TypeScript', 'DevTools', 'UniApp'],
  level: 9,
  settings: {
    theme: 'dark',
    notifications: true,
  },
})
provide(USER_INFO_KEY, userInfo)
provide('userInfo', userInfo)

// 3. 函数方法提供（供子孙直接调用修改父级状态）
function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  userInfo.settings.theme = theme.value
}
provide('updateTheme', toggleTheme)

// 4. Symbol Key 提供
provide(SYMBOL_KEY, 'Symbol-Token-Key-12345678-Secret')

// 5. 静态对象提供
provide(APP_CONFIG_KEY, {
  appName: 'UniHelper DevTools Playground',
  version: '1.0.0-beta.8',
})

// 6. 静态普通字符串
const grandparentMsg = ref('祖父组件根级广播消息 (Grandparent Msg)')
provide('grandparentMessage', grandparentMsg)

function randomizeUser() {
  userInfo.level++
  userInfo.name = `Dev User #${Math.floor(Math.random() * 1000)}`
}
</script>

<template>
  <view class="demo-card" border="~ solid gray-200 dark:gray-700 rounded-xl" p-4 mb-4 bg="white dark:gray-800" shadow-sm>
    <view flex items-center justify-between border="b solid gray-100 dark:gray-700" pb-2 mb-3>
      <view flex items-center gap-2>
        <text class="i-carbon-tree-view" text-purple-600 text-lg />
        <text font-bold text-base text="gray-800 dark:gray-100">Provide / Inject (跨层级状态注入体系)</text>
      </view>
      <text text-xs px-2 py-0.5 rounded bg="purple-50 dark:purple-900" text="purple-600 dark:purple-300">
        Multi-tier Provide / Inject
      </text>
    </view>

    <!-- 顶层 Parent 状态控制 -->
    <view bg="gray-50 dark:gray-900" p-3 rounded-lg mb-3 text-xs>
      <view flex items-center justify-between mb-2>
        <text font-semibold text-gray-700 dark:text-gray-300>👨‍🦳 ProvideInjectParent (顶层状态源):</text>
        <view flex gap-2>
          <button size="mini" bg="purple-600 text-white" px-2.5 py-1 rounded text-xs @click="toggleTheme">
            切换主题 (当前: {{ theme }})
          </button>
          <button size="mini" bg="blue-600 text-white" px-2.5 py-1 rounded text-xs @click="randomizeUser">
            更新用户信息
          </button>
        </view>
      </view>

      <view grid grid-cols-2 gap-2 font-mono text="11px text-gray-600 dark:text-gray-400">
        <view>theme: <text font-bold text-purple-600>{{ theme }}</text></view>
        <view>user: {{ userInfo.name }} (Lv.{{ userInfo.level }})</view>
        <view col-span-2 truncate>grandparentMsg: {{ grandparentMsg }}</view>
      </view>
    </view>

    <!-- 渲染中间子组件 -->
    <ProvideInjectChild />
  </view>
</template>
