<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import KeepAliveTabA from './KeepAliveTabA.vue'
import KeepAliveTabB from './KeepAliveTabB.vue'
import KeepAliveTabC from './KeepAliveTabC.vue'

defineOptions({
  name: 'DynamicKeepAliveDemo',
})

const currentTabName = ref<'TabA' | 'TabB' | 'TabC'>('TabA')

const tabsMap = {
  TabA: KeepAliveTabA,
  TabB: KeepAliveTabB,
  TabC: KeepAliveTabC,
}

const currentComponent = computed(() => tabsMap[currentTabName.value])
</script>

<template>
  <view class="demo-card" border="~ solid gray-200 dark:gray-700 rounded-xl" p-4 mb-4 bg="white dark:gray-800" shadow-sm>
    <view flex items-center justify-between border="b solid gray-100 dark:gray-700" pb-2 mb-3>
      <view flex items-center gap-2>
        <text class="i-carbon-switcher" text-orange-600 text-lg />
        <text font-bold text-base text="gray-800 dark:gray-100">Dynamic & KeepAlive (动态组件与组件缓存)</text>
      </view>
      <text text-xs px-2 py-0.5 rounded bg="orange-50 dark:orange-900" text="orange-600 dark:orange-300">
        KeepAlive &amp; component:is
      </text>
    </view>

    <!-- 选项卡切换器 -->
    <view flex gap-2 mb-3>
      <button
        size="mini"
        px-3 py-1 rounded text-xs transition-colors
        :class="currentTabName === 'TabA' ? 'bg-orange-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'"
        @click="currentTabName = 'TabA'"
      >
        Tab A (缓存)
      </button>
      <button
        size="mini"
        px-3 py-1 rounded text-xs transition-colors
        :class="currentTabName === 'TabB' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'"
        @click="currentTabName = 'TabB'"
      >
        Tab B (缓存)
      </button>
      <button
        size="mini"
        px-3 py-1 rounded text-xs transition-colors
        :class="currentTabName === 'TabC' ? 'bg-gray-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'"
        @click="currentTabName = 'TabC'"
      >
        Tab C (不缓存)
      </button>
    </view>

    <!-- 动态组件与 KeepAlive (H5/App 平台原生支持，小程序平台通过条件切换兼容) -->
    <!-- #ifdef H5 || APP-PLUS -->
    <KeepAlive :include="['KeepAliveTabA', 'KeepAliveTabB']">
      <component :is="currentComponent" />
    </KeepAlive>
    <!-- #endif -->
    <!-- #ifndef H5 || APP-PLUS -->
    <KeepAliveTabA v-if="currentTabName === 'TabA'" />
    <KeepAliveTabB v-else-if="currentTabName === 'TabB'" />
    <KeepAliveTabC v-else-if="currentTabName === 'TabC'" />
    <!-- #endif -->
  </view>
</template>
