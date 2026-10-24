<script>
// 写法二：普通 <script> 里的 setup() 函数，绑定靠 return 暴露
import { ref } from 'vue'

export default {
  name: 'SetupFunctionCounter',
  setup() {
    const count = ref(0)
    const increment = () => count.value++
    return { count, increment }
  },
}
</script>

<template>
  <view class="kv">
    SetupFunctionCounter：count = {{ count }}
  </view>
  <view class="btn" @click="increment">
    +1
  </view>
</template>
