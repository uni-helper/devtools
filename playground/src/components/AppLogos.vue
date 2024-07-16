<script setup lang="ts">
function handelClick() {
  console.log({
    aa:1,
    bb:'111',
    cc: {
      dd: true
    },
    ee: [1,2,3]
  })
  console.log([1,2,3,2,2,,2,2,,2,2,2,2,2,2,,2,2,,])
  console.log([1,2,3,2])
}
</script>

<template>
  <view inline-flex cursor-default text-2xl font-300>
    <view
      flex
      flex-col
      items-center
      hover-class="drop-shadow-md drop-shadow-color-green5"
      @click="handelClick"
    >
      <image inline-block h-18 w-18 src="/static/logo.svg" />
      <text mt--2 text-green5>
        uni-helper
      </text>
    </view>
    <view
      text="3xl gray4"
      m="x-4 y-auto"

      i-carbon-add transform transition-all-500 hover:rotate-135
    />
    <view flex flex-col hover-class="drop-shadow-md drop-shadow-color-purple5">
      <image inline-block h-18 w-18 src="/static/vite.png" />
      <text mt--2 text-purple5>
        Vite
      </text>
    </view>
  </view>
</template>
