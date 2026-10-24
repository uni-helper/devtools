<template>
  <view>
    <slot />
    <navigator url="/pages/index" open-type="reLaunch" class="mt-4 block text-center text-xs text-teal-600">
      ← 返回场景目录
    </navigator>
  </view>
</template>
