<script setup lang="ts">
// 一棵固定形状的小子树：整组显示 / 隐藏时，面板里应整块出现 / 消失
import GroupLeaf from './GroupLeaf.vue'
</script>

<template>
  <view class="kv">
    TreeGroup
    <GroupLeaf v-for="n in 3" :key="n" :index="n" />
  </view>
</template>
