<script setup>
import { ref, version } from 'vue'

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

/** 递归获取组件名称和地址 */
function getComponents(vm) {
  const components = []
  for (const child of vm.$children) {
    const { type } = child.$

    const name = type.name
      ? type.name
      : type.__name
        ? type.__name
        : type.__file.slice(type.__file.lastIndexOf('/') + 1)

    if (name === 'UniDevTools')
      continue

    const file = type.__file
    if (child.$children?.length > 0) {
      const childComponents = getComponents(child)
      components.push({
        name,
        file,
        children: childComponents,
      })
    }
    else {
      components.push({ name, file })
    }
  }
  return components
}

function handleTap() {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  const components = getComponents(currentPage.$vm)
  const { uniPlatform, uniCompileVersion, uniRuntimeVersion } = uni.getSystemInfoSync()

  const data = {
    currentPage: currentPage.route,
    vueVersion: version,
    uniPlatform,
    uniCompileVersion,
    uniRuntimeVersion,
    components,
  }
  console.log(data)
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
