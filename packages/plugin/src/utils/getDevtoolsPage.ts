export function getDevtoolsPage(port: number) {
  return /* html */`
<script setup>
import { compressURLQuery } from '@uni-helper/devtools-shared'
import { onLoad } from '@dcloudio/uni-app'
import { computed, ref, getCurrentInstance, onMounted } from 'vue'

const src = ref('')
onLoad(() => {
  const instance = getCurrentInstance().proxy
  const eventChannel = instance.getOpenerEventChannel();
  eventChannel.on('uniDevtoolsMessage', function(data) {
    console.log('uniDevtoolsMessage', data)
    src.value = 'http://localhost:${port}/?data='+compressURLQuery(data)
  })
})
</script>
  
<template>
  <web-view :src="src" id="id" />
</template>
  `
}
