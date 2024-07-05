<script setup lang="ts">
// const { count, inc, dec } = useCount()
import { watch } from 'vue';
import { useCounterStore } from './../stores/counter'
import { useCounterStore1 } from './../stores/couter1'
const counter = useCounterStore()
const counter1 = useCounterStore1()

watch(
  () => counter.count,
  (count) => {
    if (count === 5) {
      console.warn('count is 5')
    }
    console.log(11111111111111111)
  }
)
</script>

<template>
  <view inline-flex m="y-3">
    <view class="btn" @click="counter.dec()">
      <text i-carbon-subtract />
    </view>
    <view font="mono" w="15" m-auto inline-block>
      {{ counter.count }}
      {{ counter.doubleCount }}
    </view>
    <view class="btn" @click="counter.inc()">
      <text i-carbon-add />
    </view>
  </view>

  <view inline-flex m="y-3">
    <view class="btn" @click="counter1.dec()">
      <text i-carbon-subtract />
    </view>
    <view font="mono" w="15" m-auto inline-block>
      {{ counter1.count }}
      {{ counter1.doubleCount }}
    </view>
    <view class="btn" @click="counter1.inc()">
      <text i-carbon-add />
    </view>
  </view>
</template>

<style>
.btn {
  --at-apply: w-8 h-8 flex items-center justify-center rounded-full bg-teal-600 text-white cursor-pointer
}
</style>
