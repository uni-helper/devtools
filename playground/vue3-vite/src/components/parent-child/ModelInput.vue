<script setup lang="ts">
// defineModel：默认 v-model + 具名 v-model:count
const text = defineModel<string>({ default: '' })
const count = defineModel<number>('count', { default: 0 })
</script>

<template>
  <input v-model="text" class="mb-2 border border-gray-300 rounded px-2 py-1 text-xs">
  <view class="btn" @click="count++">
    子组件里 count +1
  </view>
</template>
