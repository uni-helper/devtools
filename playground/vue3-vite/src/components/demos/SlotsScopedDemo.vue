<script setup lang="ts">
import { ref } from 'vue'

export interface SlotArticleItem {
  id: number
  title: string
  author: string
  stars: number
}

const props = withDefaults(
  defineProps<{
    headerTitle?: string
    dynamicSlotName?: string
  }>(),
  {
    headerTitle: '插槽演示默认标题',
    dynamicSlotName: 'extraSlot',
  }
)

const items = ref<SlotArticleItem[]>([
  { id: 1, title: '深入理解 Vue3 组件模型', author: 'Evan', stars: 999 },
  { id: 2, title: 'UniApp 跨端工程化实践', author: 'UniTeam', stars: 768 },
  { id: 3, title: 'DevTools 探针与状态检视原理解密', author: 'Flipper', stars: 1205 },
])

const currentTime = ref(new Date().toLocaleTimeString())

function toggleStar(id: number) {
  const item = items.value.find((i) => i.id === id)
  if (item) item.stars++
}
</script>

<template>
  <view class="demo-card" border="~ solid gray-200 dark:gray-700 rounded-xl" p-4 mb-4 bg="white dark:gray-800" shadow-sm>
    <view flex items-center justify-between border="b solid gray-100 dark:gray-700" pb-2 mb-3>
      <view flex items-center gap-2>
        <text class="i-carbon-template" text-cyan-600 text-lg />
        <text font-bold text-base text="gray-800 dark:gray-100">SlotsScopedDemo (默认、具名与作用域插槽)</text>
      </view>
      <text text-xs px-2 py-0.5 rounded bg="cyan-50 dark:cyan-900" text="cyan-600 dark:cyan-300">
        Slots & Scoped Props
      </text>
    </view>

    <!-- 1. 具名插槽 header (提供 title, count, time 作用域参数) -->
    <view border="b dashed gray-200 dark:gray-700" pb-2 mb-3>
      <slot name="header" :title="props.headerTitle" :count="items.length" :time="currentTime">
        <!-- 默认备用内容 -->
        <view text-xs text-gray-400 italic>
          [默认 Header 备用内容]: {{ props.headerTitle }} (Total: {{ items.length }})
        </view>
      </slot>
    </view>

    <!-- 2. 默认插槽 default (带 summary 数据) -->
    <view mb-3 text-xs>
      <slot :summary="`共有 ${items.length} 篇精选文章可供调试`">
        <!-- 默认备用内容 -->
        <text text-gray-400 italic>[默认插槽备用内容]: 暂无外层内容传入</text>
      </slot>
    </view>

    <!-- 3. 作用域列表插槽 item (逐项向父级暴露 row, index, toggleStar) -->
    <view mb-3>
      <text text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2 block>作用域插槽列表 (v-for slot: item):</text>
      <view flex flex-col gap-2>
        <view v-for="(item, index) in items" :key="item.id">
          <slot
            name="item"
            :row="item"
            :index="index"
            :is-first="index === 0"
            :toggle-star="() => toggleStar(item.id)"
          >
            <!-- 列表项默认备用渲染 -->
            <view flex items-center justify-between p-2 rounded bg="gray-50 dark:gray-900" text-xs>
              <text>{{ index + 1 }}. {{ item.title }} (by {{ item.author }})</text>
              <text text-amber-500 font-mono>★ {{ item.stars }}</text>
            </view>
          </slot>
        </view>
      </view>
    </view>

    <!-- 4. 扩展插槽 slot: extraSlot -->
    <view border="t dashed gray-200 dark:gray-700" pt-2 mt-2 mb-2>
      <slot name="extraSlot" :extra="999">
        <text text-xs text-gray-400 italic>[扩展插槽: extraSlot 的默认备用内容]</text>
      </slot>
    </view>

    <!-- 5. 具名插槽 footer -->
    <view border="t solid gray-100 dark:gray-700" pt-2 mt-2 text-right>
      <slot name="footer">
        <text text-xs text-gray-400 italic>[默认 Footer 备用内容]</text>
      </slot>
    </view>
  </view>
</template>
