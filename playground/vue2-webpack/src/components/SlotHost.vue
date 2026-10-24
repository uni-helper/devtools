<template>
  <view class="slot-host">
    <text class="tag">SlotHost · 默认/具名/作用域插槽</text>
    <view class="slot-default">
      <slot />
    </view>
    <view class="slot-named">
      <slot name="footer" />
    </view>
    <view class="slot-scoped">
      <slot name="row" :label="hostLabel" :index="hostIndex" />
    </view>
  </view>
</template>

<script>
export default {
  name: 'SlotHost',
  data() {
    return {
      hostIndex: 7,
      hostPrefix: 'host',
    }
  },
  computed: {
    hostLabel() {
      return `${this.hostPrefix}-label`
    },
  },
}
</script>
