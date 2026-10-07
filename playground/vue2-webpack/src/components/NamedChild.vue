<template>
  <view class="named-child">
    <text>{{ tag }}</text>
  </view>
</template>

<script>
// 对照组：显式 name，验证 name 是否也能活到 mp 产物
export default {
  name: 'NamedChild',
  data() {
    return {
      tag: 'named',
    }
  },
}
</script>
