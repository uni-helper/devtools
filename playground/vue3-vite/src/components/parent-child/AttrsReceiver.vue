<script setup lang="ts">
// 关掉 attrs 自动继承：未声明的属性只出现在面板 Attrs 区，不落到根节点
defineOptions({ inheritAttrs: false })
defineProps<{ label: string }>()
const attrs = useAttrs()
</script>

<template>
  <view class="kv">
    AttrsReceiver：label 已声明；attrs 键 = {{ Object.keys(attrs).join(', ') }}
  </view>
</template>
