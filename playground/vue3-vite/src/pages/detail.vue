<script setup lang="ts">
import PageIntro from '@/components/PageIntro.vue'

const query = ref<Record<string, string | undefined>>({})

onLoad((options) => {
  query.value = options ?? {}
})
</script>

<template>
  <view class="page">
    <PageIntro
      title="页面栈与路由参数"
      :checks="[
        'Pages 页签：当前路由为 /pages/detail，query 含 id',
        '组件树顶部的页面下拉框里同时有 index 与 detail 两个页面（页面栈 = 2）',
        '返回后页面栈回到 1，detail 从下拉框消失',
      ]"
    />
    <view class="card">
      <view class="kv">
        query = {{ JSON.stringify(query) }}
      </view>
    </view>
  </view>
</template>
