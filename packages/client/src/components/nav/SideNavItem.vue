<script setup lang="ts">
import type { DevtoolsTab } from '../../types/tab'
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import TabIcon from './TabIcon.vue'

const props = defineProps<{
  tab: DevtoolsTab
  active: boolean
  expanded?: boolean
}>()

const tooltip = computed(() => ({
  content: props.tab.title,
  disabled: props.expanded,
}))
const tabPath = computed(() => props.tab.path ?? `/${props.tab.id}`)

// uni-devtools：官方原写法把导航写成模板内联三元表达式，Vue 编译后只求值
// 不调用，点击回落到 <a href> 整页跳转（standalone 下 ?mock 等查询参数随跳转
// 丢失）。改为显式方法：对齐 RouterLink guardEvent 语义——修饰键/非左键点击
// 放行默认行为（ctrl/cmd 开新标签页等），仅普通左键阻止默认 + 路由内跳转。
const router = useRouter()
function onTabClick(e: MouseEvent) {
  // 对齐 RouterLink guardEvent 语义：修饰键/非左键点击放行默认行为
  //（ctrl/cmd 点击开新标签页等），仅普通左键做应用内导航
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return
  if (e.button !== undefined && e.button !== 0) return
  e.preventDefault()
  void router.push(tabPath.value)
}
</script>

<template>
  <RouterLink v-slot="{ href }" :to="tabPath" custom>
    <a
      v-tooltip.right="tooltip"
      class="side-nav-item no-underline"
      :href="href"
      :aria-label="tab.title"
      :aria-current="active ? 'page' : undefined"
      :class="{
        'side-nav-item-active': active,
        'side-nav-item-expanded': expanded,
      }"
      @click="onTabClick"
    >
      <TabIcon :icon="tab.icon" />
      <span v-if="expanded" class="min-w-0 truncate text-3.5 font-500">
        {{ tab.title }}
      </span>
    </a>
  </RouterLink>
</template>
