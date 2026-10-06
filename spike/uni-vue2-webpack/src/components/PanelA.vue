<template>
  <view class="panel panel-a">
    <text class="tag">PanelA（v-if 分支）</text>
    <text class="cell">aValue = {{ aValue }}</text>
    <text class="cell">aDoubled = {{ aDoubled }}</text>
  </view>
</template>

<script>
// 小程序不支持 <component :is>，用 v-if/v-else 切换组件来测「组件树节点增删」
export default {
  name: 'PanelA',
  data() {
    return {
      aValue: 10,
    }
  },
  computed: {
    aDoubled() {
      return this.aValue * 2
    },
  },
}
</script>
