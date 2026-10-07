<template>
  <view class="panel panel-b">
    <text class="tag">PanelB（v-else 分支）</text>
    <text class="cell">bValue = {{ bValue }}</text>
    <text class="cell">bInverted = {{ bInverted }}</text>
  </view>
</template>

<script>
export default {
  name: 'PanelB',
  data() {
    return {
      bValue: 100,
      bNote: '分支切换后旧实例应被销毁',
    }
  },
  computed: {
    bInverted() {
      return -this.bValue
    },
  },
}
</script>
