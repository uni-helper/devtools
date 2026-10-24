<script setup lang="ts">
// 每个场景页的页头：说明这页验证什么、去面板哪里看
defineProps<{
  title: string
  /** 面板里该核对的事项，一条一句 */
  checks: string[]
}>()
</script>

<template>
  <view class="card">
    <view class="mb-1 text-base font-bold">
      {{ title }}
    </view>
    <view v-for="(check, index) in checks" :key="index" class="text-xs text-gray-500 leading-5">
      · {{ check }}
    </view>
  </view>
</template>
