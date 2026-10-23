<script setup lang="ts">
import { THEME_KEY, USER_KEY } from '@/utils/keys'

const theme = inject(THEME_KEY)
const user = inject(USER_KEY)
const middleMessage = inject<string>('middleMessage')
// 没有任何祖先提供 missing：应拿到默认值
const missing = inject('missing', '默认值')
</script>

<template>
  <view class="kv">
    InjectConsumer：theme = {{ theme }} · user = {{ user?.name }}（Lv.{{ user?.level }}）· {{ middleMessage }} · missing = {{ missing }}
  </view>
</template>
