<script setup lang="ts">
defineProps<{ rowId: number }>()
</script>

<template>
  <view class="kv">
    ListRow #{{ rowId }}
  </view>
</template>
