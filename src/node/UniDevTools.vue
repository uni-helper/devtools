<script setup>
import { ref } from 'vue'

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

const show = ref(false)
function handleTap() {
  // show.value = !show.value
  // console.log('Tap!')
  // 5秒后自动关闭
  // setTimeout(() => {
  //   show.value = !show.value
  // }, 5000)
  uni.navigateTo({
    url: '/__uni_devtools_page/index'
  })
}

function handleChange(event) {
  console.log('Message from webview:', event.detail.data)
  show.value = !show.value
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
  <!-- <web-view v-if="show" src="http://localhost:3000" @message="(e) => handleChange(e)" /> -->
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
