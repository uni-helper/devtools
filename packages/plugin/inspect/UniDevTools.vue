<script setup>
import { getCurrentInstance, ref } from 'vue'
import { setCurrentPage } from './initMPClient'

console.log('====================================================')
setCurrentPage()
const x = ref(0)
const y = ref(0)
const dragging = ref(false)
let startX = 0
let startY = 0
function handleTouchStart(event) {
  dragging.value = true
  startX = event.touches[0].clientX - x.value
  startY = event.touches[0].clientY - y.value
}

function handleTouchMove(event) {
  if (dragging.value) {
    x.value = event.touches[0].clientX - startX
    y.value = event.touches[0].clientY - startY
  }
}

function handleTouchEnd() {
  dragging.value = false
}

function getPiniaState() {
  // const state = JSON.parse(JSON.stringify(getActivePinia().state.value))
  // 获取所有 stores 的信息
  // return state
}

function handleTap() {
  console.log(getCurrentInstance())
  const pages = getCurrentPages()
  const piniaState = getPiniaState()
  const currentPage = pages[pages.length - 1]
  const { uniPlatform, uniCompileVersion, uniRuntimeVersion } = uni.getSystemInfoSync()

  const data = {
    currentPage: currentPage.route,
    uniPlatform,
    uniCompileVersion,
    uniRuntimeVersion,
    piniaState,
  }
  uni.navigateTo({
    url: `/__uni_devtools_page__temp/index`,
    success(res) {
      // 通过eventChannel向被打开页面传送数据
      res.eventChannel.emit('uniDevtoolsMessage', data)
    },
  })
}
</script>

<template>
  <view
    class="draggable"
    :style="{ left: `${x}px`, top: `${y}px`, opacity: dragging ? 1 : 0.5 }"
    @touchstart="handleTouchStart"
    @touchmove.stop.prevent="handleTouchMove"
    @touchend="handleTouchEnd"
    @tap="handleTap"
  />
</template>

<style>
.draggable {
  position: absolute;
  background-color: #42b983;
  width: 32px;
  height: 32px;
  color: white;
  padding: 10px;
  border-radius: 50%;
  cursor: grab;
  user-select: none;
}
</style>
