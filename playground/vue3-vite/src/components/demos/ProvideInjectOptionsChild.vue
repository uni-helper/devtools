<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'ProvideInjectOptionsChild',

  // Options API 形式的别名注入（专门测试 DevTools normalizeInjectOptions "originalKey -> key"）
  inject: {
    aliasedTheme: {
      from: 'theme',
      default: 'light-default',
    },
    aliasedUser: {
      from: 'userInfo',
      default: () => ({ name: 'Default Guest', role: 'visitor' }),
    },
    aliasedGrandparent: {
      from: 'grandparentMessage',
      default: 'Default Message',
    },
  },

  data() {
    return {
      optionsChildNote: 'Options API Injected Alias Test',
    }
  },
})
</script>

<template>
  <view border="~ solid blue-300 dark:blue-700 rounded-lg" p-3 mt-3 bg="blue-50/50 dark:blue-950/40" text-xs>
    <view flex items-center justify-between mb-2>
      <text font-bold text-blue-700 dark:blue-300>⚙️ ProvideInjectOptionsChild (Options API 别名注入测试)</text>
      <text px-2 py-0.5 rounded text="10px blue-600 bg-blue-100 dark:bg-blue-900">Options API</text>
    </view>

    <view flex flex-col gap-1 font-mono text="11px">
      <view>
        <text text-gray-500>theme -> aliasedTheme: </text>
        <text font-bold text-blue-600>{{ aliasedTheme }}</text>
      </view>
      <view>
        <text text-gray-500>userInfo -> aliasedUser: </text>
        <text text-blue-500>{{ (aliasedUser as any)?.name }}</text>
      </view>
      <view>
        <text text-gray-500>grandparentMessage -> aliasedGrandparent: </text>
        <text text-gray-700 dark:text-gray-300>{{ aliasedGrandparent }}</text>
      </view>
    </view>
  </view>
</template>
