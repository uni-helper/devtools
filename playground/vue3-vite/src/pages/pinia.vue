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
        'counter 里的特殊值：lookup 为 Map(1)、tags 为 Set(2)，可展开；Date / RegExp / BigInt 为字符串，Symbol / 函数为 <unserializable>',
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
