<template>
  <view class="deep deep-c">
    <text class="tag">DeepC · 第 3 层（匿名组件）</text>
    <text class="cell">cLabel = {{ cLabel }}</text>
    <text class="cell">payload.address.geo.meta.source = {{ geoSource }}</text>
  </view>
</template>

<script>
// 故意不写 name：验证深层匿名组件仍能靠 __file 兜底命名（S1 结论在深树里是否依然成立）
export default {
  props: {
    payload: {
      type: Object,
      default: () => ({}),
    },
  },
  data() {
    return {
      cOwn: 'c-own',
      cTouched: 0,
    }
  },
  computed: {
    cLabel() {
      return `C:${this.cOwn}#${this.cTouched}`
    },
    geoSource() {
      const meta = this.payload && this.payload.address && this.payload.address.geo
      return (meta && meta.meta && meta.meta.source) || '(空)'
    },
  },
  methods: {
    touch() {
      this.cTouched += 1
    },
  },
}
</script>
