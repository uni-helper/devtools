<template>
  <view class="deep deep-b">
    <text class="tag">DeepB · 第 2 层</text>
    <text class="cell">bLabel = {{ bLabel }}</text>
    <text class="cell">city = {{ city }}</text>
    <deep-c :payload="payload" />
  </view>
</template>

<script>
import DeepC from './DeepC.vue'

export default {
  name: 'DeepB',
  components: { DeepC },
  props: {
    payload: {
      type: Object,
      default: () => ({}),
    },
  },
  data() {
    return {
      bOwn: 'b-own',
    }
  },
  computed: {
    bLabel() {
      return `B:${this.bOwn}`
    },
    city() {
      return (this.payload && this.payload.address && this.payload.address.city) || '(空)'
    },
  },
}
</script>
