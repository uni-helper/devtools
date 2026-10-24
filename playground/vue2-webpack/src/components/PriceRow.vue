<template>
  <view class="price-row">
    <text class="cell">{{ item.label }}</text>
    <text class="cell">{{ item.qty }} × {{ item.price }}</text>
    <text class="cell">= {{ lineTotal }}</text>
    <button size="mini" @click="bump">
      +1
    </button>
  </view>
</template>

<script>
export default {
  name: 'PriceRow',
  props: {
    item: {
      type: Object,
      required: true,
    },
  },
  computed: {
    lineTotal() {
      return Number((this.item.qty * this.item.price).toFixed(2))
    },
  },
  methods: {
    // 子组件直接改自己的 props 对象——测探针能否采到「父数组元素被子组件改动」
    bump() {
      this.item.qty += 1
      this.$emit('changed', this.item.id)
    },
  },
}
</script>
