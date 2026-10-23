<script setup lang="ts">
import PageIntro from '@/components/PageIntro.vue'
import InjectMiddle from '@/components/provide-inject/InjectMiddle.vue'
import { THEME_KEY, USER_KEY } from '@/utils/keys'

const theme = ref<'light' | 'dark'>('dark')
const user = reactive({ name: 'Ada', level: 3 })

provide(THEME_KEY, theme)
provide(USER_KEY, user)
// Options API 组件按字符串名注入
provide('themeName', theme)

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <view class="page">
    <PageIntro
      title="Provide / Inject"
      :checks="[
        '页面显示：两个消费组件都拿到 theme / 中间层消息，missing 取到默认值',
        '点「切换主题」或在面板里改页面的 theme：两个消费组件同步变化',
        '已知缺口：探针尚无 Injected 分区——InjectConsumer 的注入值只作为 Setup 绑定出现，OptionsInjectConsumer 的 inject 在面板里看不到',
      ]"
    />
    <view class="card">
      <view class="btn" @click="toggleTheme">
        切换主题（当前 {{ theme }}）
      </view>
      <view class="btn" @click="user.level++">
        user.level +1
      </view>
    </view>
    <view class="card">
      <InjectMiddle />
    </view>
  </view>
</template>
