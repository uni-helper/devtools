<script setup lang="ts">
// 作用域插槽：每一行交给父组件渲染
defineProps<{ items: string[] }>()
</script>

<template>
  <view v-for="(item, index) in items" :key="item">
    <slot name="row" :item="item" :index="index" />
  </view>
  <slot />
</template>
