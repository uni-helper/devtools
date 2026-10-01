<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { computed } from 'vue'
import { connectionIndicator, tag } from '@design/design'
import { connectionStatus, mockMode } from '../df/client'

/**
 * 左侧竖排图标栏——「里子」对齐 Vue Devtools 的结构：检查器切换在左栏，
 * 每个检查器自带头部工具行，面板不再有顶部横条。第一轮只有一个真实视图，
 * 其余入口禁用占位，如实标注「规划中」，点击不产生任何假装成功的交互。
 */
const views = [
  { icon: 'i-ph:tree-structure-duotone', label: '组件检查器', active: true, disabled: false },
  { icon: 'i-ph:database-duotone', label: 'Pinia（规划中）', active: false, disabled: true },
  { icon: 'i-ph:path-duotone', label: '页面与路由（规划中）', active: false, disabled: true },
  { icon: 'i-ph:speedometer-duotone', label: '性能（规划中）', active: false, disabled: true },
] as const

const indicator = computed(() => connectionIndicator(connectionStatus.value))
</script>

<template>
  <aside class="h-full w-11 flex flex-col items-center gap-1 border-r border-base bg-secondary py-2 shrink-0 select-none">
    <span class="i-ph:device-mobile-duotone color-active text-lg mb-2 shrink-0" aria-hidden="true" />

    <ActionIconButton
      v-for="item in views"
      :key="item.label"
      :icon="item.icon"
      :label="item.label"
      :tooltip="item.label"
      :active="item.active"
      :disabled="item.disabled"
    />

    <span class="flex-1" />

    <span
      v-if="mockMode"
      :class="tag('amber', 'text-[9px] px-1 select-none')"
      title="URL 带 ?mock：当前展示的是 fixtures 假数据，与真实小程序无关"
    >MOCK</span>

    <!-- 连接状态收进左栏底部：圆点 + tooltip 全文，不占一行横幅 -->
    <span
      v-if="indicator"
      class="p-1 rounded-full"
      :title="`连接${indicator.label}`"
    >
      <span :class="indicator.dot" />
    </span>
  </aside>
</template>
