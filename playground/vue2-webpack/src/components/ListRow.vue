<template>
  <view class="list-row">
    <text class="cell">#{{ item.id }}</text>
    <text class="cell">{{ label }}</text>
    <text class="cell">{{ doneMark }}</text>
    <text class="cell">tags = {{ tagText }}</text>
  </view>
</template>

<script>
// 匿名组件 + v-for 复用：验证「同一组件被多次实例化」时探针能否区分各实例
// （实例 id 来自 _uid，见 tree.ts；这里同时压 props 采集与数组元素编辑）
export default {
  props: {
    item: {
      type: Object,
      required: true,
    },
  },
  computed: {
    label() {
      return this.item.text || this.item.name || '(no text)'
    },
    doneMark() {
      return this.item.done ? '✓' : '○'
    },
    tagText() {
      return Array.isArray(this.item.tags) && this.item.tags.length
        ? this.item.tags.join(',')
        : '(空)'
    },
  },
}
</script>
