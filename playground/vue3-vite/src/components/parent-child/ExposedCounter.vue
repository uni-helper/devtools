<script setup lang="ts">
// defineExpose：父组件经模板 ref 调用 increment
const count = ref(0)
function increment() {
  count.value++
}
defineExpose({ count, increment })
</script>

<template>
  <view class="kv">
    ExposedCounter：count = {{ count }}
  </view>
</template>
