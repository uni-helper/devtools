<script setup lang="ts">
import { VueCard } from '@vue/devtools-ui'

function extractDomain(url: string) {
  try {
    const parsedUrl = new URL(url)
    return parsedUrl.hostname
  }
  catch (e) {
    console.error('Invalid URL:', e)
    return null
  }
}

function extractRepoPath(url: string) {
  try {
    const parsedUrl = new URL(url)
    // 获取路径部分，并去掉开头的斜杠
    const path = parsedUrl.pathname.slice(1)
    return path
  }
  catch (e) {
    console.error('Invalid URL:', e)
    return null
  }
}

const baseDocumentData = [
  {
    id: 'uni',
    icon: '/icon/uni_icon.png',
    label: 'uni-app',
    path: 'https://uniapp.dcloud.net.cn/',
    github: 'https://github.com/dcloudio/uni-app',
  },
  {
    id: 'vue',
    icon: 'i-logos-vue',
    label: 'Vue',
    path: 'https://cn.vuejs.org/guide/introduction.html',
    github: 'https://github.com/vuejs/core',
  },
  {
    id: 'wechat',
    icon: 'i-ic:baseline-wechat',
    label: 'WeChat',
    path: 'https://developers.weixin.qq.com/miniprogram/dev/framework/',
  },
]
</script>

<template>
  <SectionBlock
    text="Developer Documents"
    description="more information about uni-app vue and miniprogram"
  >
    <div grid="~ cols-2" gap-2>
      <VueCard
        v-for="item in baseDocumentData"
        :key="item.id"
        hover="shadow-green-500/30"
        flex cursor-pointer justify-between p4 transition-shadow text-base
        @click="openInBrowser(item.path)"
      >
        <div>
          <div mb3 text-xl font-600>
            {{ item.label }}
          </div>
          <div hover="op90" mb1 flex items-center gap-1 op50>
            <div i-lucide:link />
            {{ extractDomain(item.path) }}
          </div>
          <div
            v-if="item.github"
            flex items-center gap-1 op50
            hover="op90"
            @click.stop="openInBrowser(item.github)"
          >
            <div i-lucide:github />
            {{ extractRepoPath(item.github) }}
          </div>
        </div>
        <div>
          <div mr2 rounded-lg bg-dark p-2>
            <TabIcon
              text-4xl
              :icon="item.icon"
            />
          </div>
        </div>
      </VueCard>
    </div>
  </SectionBlock>
</template>
