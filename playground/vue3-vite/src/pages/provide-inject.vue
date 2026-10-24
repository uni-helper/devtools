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
        'OptionsInjectConsumer 的 Injected 区：themeName -> aliasedTheme、middleMessage -> aliasedMessage',
        'InjectConsumer 用的是 setup 里的 inject()：注入值作为 Setup 绑定出现（与官方一致，不进 Injected 区）',
        '点「切换主题」：两个消费组件同步变化，面板重新选中后看到新值',
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
