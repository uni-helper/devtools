<script setup lang="ts">
import { inject, provide, ref } from 'vue'
import ProvideInjectGrandchild from './ProvideInjectGrandchild.vue'
import ProvideInjectOptionsChild from './ProvideInjectOptionsChild.vue'

// 注入来自 Parent 的值
const grandparentMessage = inject<string>('grandparentMessage', '')

// 在中间层提供自身的数据，供孙组件消费（测试多级 provide 链条）
const childMessage = ref('来自中间层 Child 的专属消息 (可动态响应)')
provide('childMessage', childMessage)

function updateChildMessage() {
  childMessage.value = `Child 消息已更新: ${new Date().toLocaleTimeString()}`
}
</script>

<template>
  <view border="~ solid indigo-300 dark:indigo-700 rounded-xl" p-3.5 bg="indigo-50/40 dark:indigo-950/30">
    <view flex items-center justify-between mb-2.5>
      <text font-bold text-sm text-indigo-800 dark:indigo-200>👦 ProvideInjectChild (中间子组件层级)</text>
      <text px-2 py-0.5 rounded text="10px indigo-600 bg-indigo-100 dark:bg-indigo-900">Level 2</text>
    </view>

    <view text-xs mb-3 flex items-center justify-between>
      <view>
        <text text-gray-500>Child 自身提供的消息: </text>
        <text text-indigo-600 font-mono>{{ childMessage }}</text>
      </view>
      <button size="mini" bg="indigo-600 text-white" px-2.5 py-0.5 rounded text-xs @click="updateChildMessage">
        修改 Child 消息
      </button>
    </view>

    <!-- 孙组件（Composition API） -->
    <ProvideInjectGrandchild />

    <!-- 孙组件（Options API 别名注入测试） -->
    <ProvideInjectOptionsChild />
  </view>
</template>
