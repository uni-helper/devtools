<script setup lang="ts">
// 小程序不支持 KeepAlive：切走即卸载，切回是新实例，计数从 0 开始
const clicks = ref(0)
</script>

<template>
  <view class="kv" @click="clicks++">
    PanelB · clicks = {{ clicks }}（点我 +1）
  </view>
</template>
