<script setup lang="ts">
import PageIntro from '@/components/PageIntro.vue'

// 场景目录：一页一个验证目标，新增场景在这里登记一行
const scenarios = [
  { path: '/pages/component-tree', title: '组件树增删', panel: 'Components' },
  { path: '/pages/setup-state', title: 'Composition API 状态', panel: 'Components' },
  { path: '/pages/options-state', title: '三种组件写法与 Options API', panel: 'Components' },
  { path: '/pages/parent-child', title: '父子通信', panel: 'Components' },
  { path: '/pages/provide-inject', title: 'Provide / Inject', panel: 'Components' },
  { path: '/pages/pinia', title: 'Pinia', panel: 'Pinia' },
  { path: '/pages/network', title: '网络请求', panel: 'Network' },
  { path: '/pages/storage', title: 'Storage', panel: 'MCP get-storage-*' },
  { path: '/pages/detail?id=42', title: '页面栈与路由参数', panel: 'Pages' },
]

function open(path: string) {
  uni.navigateTo({ url: path })
}
</script>

<template>
  <view class="page">
    <PageIntro
      title="Uni DevTools 验证场景"
      :checks="['每页只验证一件事，页顶写着去面板哪里看什么', '页面数据固定，每次打开初始值都相同']"
    />
    <view v-for="scenario in scenarios" :key="scenario.path" class="card" @click="open(scenario.path)">
      <view class="card-title">
        {{ scenario.title }}
      </view>
      <view class="kv">
        面板：{{ scenario.panel }}
      </view>
    </view>
  </view>
</template>

<route type="home" lang="json">
{ "layout": false }
</route>
