<template>
  <view class="deep deep-a">
    <text class="tag">DeepA · 第 1 层</text>
    <text class="cell">aLabel = {{ aLabel }}</text>
    <text class="cell">payload.name = {{ payload.name }}</text>
    <deep-b :payload="payload" />
  </view>
</template>

<script>
import DeepB from './DeepB.vue'

export default {
  name: 'DeepA',
  components: { DeepB },
  props: {
    payload: {
      type: Object,
      default: () => ({}),
    },
  },
  data() {
    return {
      aOwn: 'a-own',
      aEditable: 1,
    }
  },
  computed: {
    aLabel() {
      return `A:${this.aOwn}/${this.aEditable}`
    },
  },
}
</script>
