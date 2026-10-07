<script setup lang="ts">
import { computed, useAttrs } from 'vue'

// 禁用根元素默认继承属性（测试 DevTools Attrs 与组件内部消费关系）
defineOptions({
  name: 'AttrsFallthroughDemo',
  inheritAttrs: false,
})

// 仅声明部分 props，其余属性将进入 attrs
const props = defineProps<{
  declaredProp: string
}>()

const attrs = useAttrs()

const attrKeys = computed(() => Object.keys(attrs))
</script>

<template>
  <view class="demo-card" border="~ solid gray-200 dark:gray-700 rounded-xl" p-4 mb-4 bg="white dark:gray-800" shadow-sm>
    <view flex items-center justify-between border="b solid gray-100 dark:gray-700" pb-2 mb-3>
      <view flex items-center gap-2>
        <text class="i-carbon-layers" text-pink-600 text-lg />
        <text font-bold text-base text="gray-800 dark:gray-100">AttrsFallthroughDemo (属性穿透与 inheritAttrs)</text>
      </view>
      <text text-xs px-2 py-0.5 rounded bg="pink-50 dark:pink-900" text="pink-600 dark:pink-300">
        Attrs &amp; useAttrs()
      </text>
    </view>

    <view text-xs mb-3 text-gray-500>
      本组件设置了 <text font-mono text-pink-600>inheritAttrs: false</text>，未在 props 中声明的非 Prop 属性（如 class、style、data-* 等）将收集在 DevTools 的 <text font-mono font-bold text-pink-600>Attrs</text> 标签中。
    </view>

    <!-- 显式声明的 prop -->
    <view mb-2 text-xs bg="gray-50 dark:gray-900" p-2 rounded>
      <text text-gray-400>声明的 Props (declaredProp): </text>
      <text font-mono font-bold text-pink-600>{{ props.declaredProp }}</text>
    </view>

    <!-- 捕获到的透传 Attrs 列表 -->
    <view text-xs bg="gray-50 dark:gray-900" p-2 rounded mb-3>
      <text font-semibold text-gray-700 dark:text-gray-300 mb-1 block>捕获到的 Attrs 键值 (通过 useAttrs()):</text>
      <view flex flex-col gap-1 font-mono text="11px">
        <view v-for="key in attrKeys" :key="key" flex justify-between>
          <text text-pink-500 font-bold>{{ key }}:</text>
          <text text-gray-600 dark:text-gray-400 truncate max-w="220px">{{ String(attrs[key]) }}</text>
        </view>
      </view>
    </view>

    <!-- 将 $attrs 手动绑定至内部目标卡片 (H5/App 平台支持 v-bind="$attrs") -->
    <!-- #ifdef H5 || APP-PLUS -->
    <view
      v-bind="$attrs"
      p-2.5 rounded-lg text-xs
      border="~ dashed pink-300 dark:pink-700"
      bg="pink-50/50 dark:pink-950/30"
    >
      <text text-pink-700 dark:text-pink-300 font-semibold block>
        🎯 内部挂载目标 (手动 v-bind="$attrs")
      </text>
      <text text="10px gray-400">
        父级传入的 class、style 和自定义 attribute 均透传作用于该元素
      </text>
    </view>
    <!-- #endif -->
    <!-- #ifndef H5 || APP-PLUS -->
    <view
      p-2.5 rounded-lg text-xs
      border="~ dashed pink-300 dark:pink-700"
      bg="pink-50/50 dark:pink-950/30"
    >
      <text text-pink-700 dark:text-pink-300 font-semibold block>
        🎯 内部挂载目标 (小程序端兼容)
      </text>
      <text text="10px gray-400">
        小程序编译器不支持 v-bind="$attrs" 模板指令，上方已通过 useAttrs() 完整捕获并展示
      </text>
    </view>
    <!-- #endif -->
  </view>
</template>
