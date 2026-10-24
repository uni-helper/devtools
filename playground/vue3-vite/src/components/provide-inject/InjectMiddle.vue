<script setup lang="ts">
// 中间层：自己也 provide 一个值，验证面板里注入来源分层正确
import InjectConsumer from './InjectConsumer.vue'
import OptionsInjectConsumer from './OptionsInjectConsumer.vue'

provide('middleMessage', '来自 InjectMiddle')
</script>

<template>
  <view class="kv">
    InjectMiddle
  </view>
  <InjectConsumer />
  <OptionsInjectConsumer />
</template>
