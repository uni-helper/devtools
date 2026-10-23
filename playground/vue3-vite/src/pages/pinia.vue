<script setup lang="ts">
import PageIntro from '@/components/PageIntro.vue'
import { useCounterStore } from '@/stores/counter'
import { useProfileStore } from '@/stores/profile'

const counter = useCounterStore()
const profile = useProfileStore()
</script>

<template>
  <view class="page">
    <PageIntro
      title="Pinia"
      :checks="[
        'Pinia 页签：有 counter（Options 写法）和 profile（Setup 写法）两个 store',
        '点按钮后，选中的 store 状态与 getter（double / title）在面板里同步',
        '面板里把 counter.count 改成 10：页面显示 10，double 变 20',
        'counter 里的 Date / RegExp / Map / Set / BigInt / Symbol / 函数都能展示、不报错',
      ]"
    />
    <view class="card">
      <view class="kv">
        counter.count = {{ counter.count }} · double = {{ counter.double }}
      </view>
      <view class="btn" @click="counter.increment()">
        counter.increment()
      </view>
    </view>
    <view class="card">
      <view class="kv">
        profile.title = {{ profile.title }}
      </view>
      <view class="btn" @click="profile.levelUp()">
        profile.levelUp()
      </view>
    </view>
  </view>
</template>
