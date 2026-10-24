<script setup lang="ts">
// 写法三：<script setup>，且不声明组件名——面板里的名字应取自文件名
const count = ref(0)
</script>

<template>
  <view class="kv">
    SetupSugarCounter：count = {{ count }}
  </view>
  <view class="btn" @click="count++">
    +1
  </view>
</template>
