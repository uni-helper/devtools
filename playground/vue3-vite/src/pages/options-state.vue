<script setup lang="ts">
import PageIntro from '@/components/PageIntro.vue'
import OptionsCounter from '@/components/state/OptionsCounter.vue'
import SetupFunctionCounter from '@/components/state/SetupFunctionCounter.vue'
import SetupSugarCounter from '@/components/state/SetupSugarCounter.vue'
</script>

<template>
  <view class="page">
    <PageIntro
      title="三种组件写法与 Options API"
      :checks="[
        'Components 里三个组件都显示正确名字；SetupSugarCounter 没声明 name，名字取自文件名',
        'OptionsCounter：Props（step=2）、Data（count / config / firstName / lastName）、Computed（double / fullName）分区齐全',
        '面板里编辑 OptionsCounter 的 fullName：firstName / lastName 跟着变',
        '三个组件的 count 都能在面板里读到、改值后页面同步',
      ]"
    />
    <view class="card">
      <OptionsCounter :step="2" />
    </view>
    <view class="card">
      <SetupFunctionCounter />
    </view>
    <view class="card">
      <SetupSugarCounter />
    </view>
  </view>
</template>
