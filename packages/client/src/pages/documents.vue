<script setup lang="ts">
const baseDocumentData = [
  {
    icon: 'i-icon-park-outline:document-text',
    label: 'uni-app',
    path: 'https://uniapp.dcloud.net.cn/',
    id: 'uni',
  },
  {
    icon: 'i-logos-vue',
    label: 'Vue',
    path: 'https://developers.weixin.qq.com/miniprogram/dev/framework/',
    id: 'vue',
  },
]
const checkedId = ref('vue')
const docLink = computed(() => {
  return baseDocumentData.find(item => item.id === checkedId.value)!.path
})
</script>

<template>
  <div class="relative h-full flex flex-col">
    <DevToolsHeader :doc-link="docLink">
      <TopNav v-model="checkedId" :data="baseDocumentData" />
    </DevToolsHeader>

    <IframeView :src="docLink" />
  </div>
</template>
