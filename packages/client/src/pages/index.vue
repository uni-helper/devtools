<script setup lang="ts">
import { VueBadge, VueButton } from '@vue/devtools-ui'
import Logo from '/icon.png'

const router = useRouter()
const clientState = devtoolsClientState

function visit() {
  clientState.value.isFirstVisit = false
  clientState.value.route = '/overview'
  router.replace('/overview')
}
</script>

<template>
  <div flex="~ col gap4" mxa h-screen items-center justify-center px4 text-center>
    <div flex="~" items-center justify-center>
      <img :src="Logo" w-16>
      <VueBadge
        mr--15 mt--10 bg-green-400:10 text-green-400
      >
        preview
      </VueBadge>
    </div>
    <p my2 text-xl font-bold>
      👋 欢迎使用Uni DevTools!
    </p>
    <p text-lg>
      <b font-bold>Uni DevTools</b> 是一套可视化工具，可以帮助你更好地了解你的小程序，并提高你使用Uni的开发体验。
    </p>
    <p text-lg>
      请注意 <span rounded bg-orange:10 px2 py0.5 text-orange font-bold>Uni DevTools仍处于早期预览状态中</span>, 功能可能是不完整和不稳定。 如果您发现任何错误或有任何建议，<a href="https://github.com/webfansplz/vite-plugin-vue-devtools" target="_blank" text-primary hover-underline>请创建一个问题或讨论。</a>  谢谢你，玩得开心！
    </p>

    <VueButton type="primary" @click="visit">
      <span>开始使用</span>
    </VueButton>
  </div>
</template>
