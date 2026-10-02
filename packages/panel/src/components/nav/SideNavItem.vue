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
  content: props.tab.disabled
    ? `${props.tab.title}（${props.tab.disabledReason ?? '后端能力未就绪'}）`
    : props.tab.title,
  disabled: props.expanded,
}))
const tabPath = computed(() => props.tab.path ?? `/${props.tab.id}`)

// uni-devtools：官方原写法 `@click="tab.disabled ? undefined : navigate"` 是三元
// 内联语句，Vue 编译为 `$event => (tab.disabled ? undefined : navigate)`——只求值
// 不调用，点击回落到 <a href> 整页跳转（standalone 下 ?mock 等查询参数随跳转丢失，
// 官方宿主内被路由兜底掩盖）。改为显式方法：禁用不响应，可用则阻止默认 + 路由内跳转。
const router = useRouter()
function onTabClick(e: MouseEvent) {
  if (props.tab.disabled) return
  // 对齐 RouterLink guardEvent 语义：修饰键/非左键点击放行默认行为
  //（ctrl/cmd 点击开新标签页等），仅普通左键做应用内导航
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return
  if (e.button !== undefined && e.button !== 0) return
  e.preventDefault()
  void router.push(tabPath.value)
}
</script>

<template>
  <RouterLink v-slot="{ href, navigate }" :to="tabPath" custom>
    <a
      v-tooltip.right="tooltip"
      class="side-nav-item no-underline"
      :href="tab.disabled ? undefined : href"
      :aria-label="tab.title"
      :aria-current="active ? 'page' : undefined"
      :aria-disabled="tab.disabled || undefined"
      :class="{
        'side-nav-item-active': active,
        'side-nav-item-expanded': expanded,
        'side-nav-item-disabled': tab.disabled,
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
