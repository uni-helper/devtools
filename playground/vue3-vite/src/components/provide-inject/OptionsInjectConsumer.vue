<script>
// Options API 的别名注入：本地名 ≠ 注入名，面板里应显示「本地名 ← 注入名」
export default {
  name: 'OptionsInjectConsumer',
  inject: {
    aliasedTheme: { from: 'themeName', default: 'light' },
    aliasedMessage: { from: 'middleMessage', default: '无' },
  },
}
</script>

<template>
  <view class="kv">
    OptionsInjectConsumer：aliasedTheme = {{ aliasedTheme }} · aliasedMessage = {{ aliasedMessage }}
  </view>
</template>
