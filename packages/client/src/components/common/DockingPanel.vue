<script setup lang="ts">
import { VueButton, VueIcon } from '@vue/devtools-ui'

async function opeInBrowser() {
  await trpc.openInBrowser.query(window.location.href)
}
async function openInClient() {
  await trpc.openInClient.query()
}
function refreshPage() {
  location.reload()
}
</script>

<template>
  <div>
    <div px3 py2 border="b base" flex="~ gap-2">
      <VueButton outlined type="primary" @click="opeInBrowser">
        <VueIcon icon="i-icon-park-outline:browser-safari" />
        在浏览器打开
      </VueButton>
      <VueButton outlined type="primary" @click="openInClient">
        <VueIcon icon="i-material-symbols:desktop-windows-outline-sharp" />
        在客户端打开
      </VueButton>
    </div>
    <div px3 py2 flex="~ gap2">
      <VueButton outlined type="primary" @click="refreshPage">
        <VueIcon icon="i-lucide:refresh-cw" />
        刷新页面
      </VueButton>
    </div>
  </div>
</template>
