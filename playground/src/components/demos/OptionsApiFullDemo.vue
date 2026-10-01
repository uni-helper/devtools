<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'OptionsApiFullDemo',

  // 1. Props 定义
  props: {
    title: {
      type: String,
      default: 'Options API 组件标题',
    },
    initialCount: {
      type: Number,
      default: 5,
    },
  },

  // 2. 事件声明
  emits: ['customOptionsAction'],

  // 3. 依赖注入
  inject: {
    injectedTheme: {
      from: 'theme',
      default: 'light',
    },
  },

  // 4. Options API Data 数据（在 DevTools 的 Data 标签中展示且支持双向编辑）
  data() {
    return {
      counter: this.initialCount,
      userName: 'LegacyCoder',
      config: {
        debug: true,
        maxRetries: 3,
      },
      tags: ['Options', 'Vue2Style', 'DevToolsData'],
      firstName: '张',
      lastName: '三',
    }
  },

  // 5. 计算属性（含只读和可写 computed）
  computed: {
    doubledCounter(): number {
      return this.counter * 2
    },

    // 可写计算属性（DevTools 识别 set 并允许直接在线编辑修改）
    fullName: {
      get(): string {
        return `${this.firstName} ${this.lastName}`
      },
      set(val: string) {
        const parts = val.trim().split(/\s+/)
        this.firstName = parts[0] || ''
        this.lastName = parts.slice(1).join(' ') || ''
      },
    },
  },

  // 6. 侦听器
  watch: {
    counter(newVal, oldVal) {
      console.log(`[OptionsApiFullDemo] counter changed from ${oldVal} to ${newVal}`)
    },
  },

  // 7. 方法
  methods: {
    increment() {
      this.counter++
      this.$emit('customOptionsAction', {
        action: 'increment',
        current: this.counter,
      })
    },

    reset() {
      this.counter = this.initialCount
      this.$emit('customOptionsAction', {
        action: 'reset',
        current: this.counter,
      })
    },
  },
})
</script>

<template>
  <view class="demo-card" border="~ solid gray-200 dark:gray-700 rounded-xl" p-4 mb-4 bg="white dark:gray-800" shadow-sm>
    <view flex items-center justify-between border="b solid gray-100 dark:gray-700" pb-2 mb-3>
      <view flex items-center gap-2>
        <text class="i-carbon-script" text-violet-600 text-lg />
        <text font-bold text-base text="gray-800 dark:gray-100">OptionsApiFullDemo (Options API 全量语法支持)</text>
      </view>
      <text text-xs px-2 py-0.5 rounded bg="violet-50 dark:violet-900" text="violet-600 dark:violet-300">
        Options API Data / Methods / Computed
      </text>
    </view>

    <view text-xs mb-3 text-gray-500>
      测试 DevTools 对标准 Options API 的状态抓取能力：<text font-mono font-bold text-violet-600>Data</text> 面板（可直接编辑）、<text font-mono font-bold text-violet-600>Computed</text>、<text font-mono font-bold text-violet-600>Props</text> 及 <text font-mono font-bold text-violet-600>Injected</text>。
    </view>

    <!-- Data & Computed 属性展示 -->
    <view grid grid-cols-2 gap-2 text-xs mb-3 bg="gray-50 dark:gray-900" p-2.5 rounded-lg font-mono>
      <view>
        <text text-gray-400>counter (Data): </text>
        <text font-bold text-violet-600>{{ counter }}</text>
      </view>
      <view>
        <text text-gray-400>doubled (Computed): </text>
        <text font-bold text-blue-600>{{ doubledCounter }}</text>
      </view>
      <view>
        <text text-gray-400>userName (Data): </text>
        <text text-gray-700 dark:text-gray-300>{{ userName }}</text>
      </view>
      <view>
        <text text-gray-400>injectedTheme: </text>
        <text text-amber-600>{{ injectedTheme }}</text>
      </view>
    </view>

    <!-- 可写计算属性编辑测试 -->
    <view mb-3 text-xs>
      <text font-semibold text-gray-600 dark:text-gray-300 mb-1 block>可写 Computed (fullName):</text>
      <input
        v-model="fullName"
        placeholder="修改全名 (测试 Options API computed setter)..."
        border="~ solid gray-300 dark:gray-600 rounded"
        p="x-2 y-1"
        bg="gray-50 dark:gray-900"
        text-xs
      >
    </view>

    <!-- 交互操作按钮 -->
    <view flex items-center justify-between border="t solid gray-100 dark:gray-700" pt-2.5>
      <view text-xs text-gray-400 font-mono>
        debug: {{ String(config.debug) }} | maxRetries: {{ config.maxRetries }}
      </view>
      <view flex gap-2>
        <button size="mini" bg="violet-600 text-white" px-3 py-1 rounded text-xs @click="increment">
          counter +1
        </button>
        <button size="mini" bg="gray-500 text-white" px-3 py-1 rounded text-xs @click="reset">
          重置
        </button>
      </view>
    </view>
  </view>
</template>
