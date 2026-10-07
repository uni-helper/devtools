<template>
  <view class="anon-child">
    <text>{{ label }}</text>
  </view>
</template>

<script>
// 故意不写 name：探针只能靠 __file 兜底命名（这是 S1 要验证的路径）
export default {
  props: {
    from: {
      type: String,
      default: 'page',
    },
  },
  data() {
    return {
      count: 1,
    }
  },
  computed: {
    label() {
      return `${this.from}-${this.count}`
    },
  },
  methods: {
    bump() {
      this.count += 1
    },
  },
}
</script>

<style>
.anon-child {
  color: #333;
}
</style>
