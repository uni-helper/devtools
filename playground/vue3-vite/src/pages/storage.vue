<script setup lang="ts">
import PageIntro from '@/components/PageIntro.vue'

const keys = ref<string[]>([])

function refresh() {
  keys.value = uni.getStorageInfoSync().keys
}

function writeSync() {
  uni.setStorageSync('demo_user', { name: 'Ada', level: 3 })
  refresh()
}

function writeAsync() {
  uni.setStorage({ key: 'demo_token', data: 'token-123', success: refresh })
}

function removeAll() {
  uni.removeStorageSync('demo_user')
  uni.removeStorage({ key: 'demo_token', complete: refresh })
}

onShow(refresh)
</script>

<template>
  <view class="page">
    <PageIntro
      title="Storage"
      :checks="[
        '面板没有 Storage 页签，用 MCP 的 get-storage-info / get-storage-entries 核对',
        '写入后 keys 立即包含 demo_user / demo_token（探针拦截写操作，元数据缓存随即失效）',
        'get-storage-entries 读到 demo_user = {name: Ada, level: 3}',
      ]"
    />
    <view class="card">
      <view class="btn" @click="writeSync">
        setStorageSync(demo_user)
      </view>
      <view class="btn" @click="writeAsync">
        setStorage(demo_token)
      </view>
      <view class="btn" @click="removeAll">
        删除这两个键
      </view>
      <view class="kv">
        当前 keys：{{ keys.join(', ') || '（空）' }}
      </view>
    </view>
  </view>
</template>
