<script setup lang="ts">
// W13 Network 采集演示：三种调用形态（回调式 GET / Promise 式 POST / 必失败请求）
// 供真机验证 Network tab 捕获链路——即使外网不可达，fireFail 也必然产生一条记录
import { ref } from 'vue'

const lastResult = ref('（尚未发起请求）')
const requesting = ref(false)

function brief(data: unknown): string {
  try {
    return JSON.stringify(data).slice(0, 120)
  }
  catch {
    return String(data)
  }
}

function fireGet() {
  requesting.value = true
  lastResult.value = 'GET 请求中…'
  uni.request({
    url: 'https://httpbin.org/get',
    method: 'GET',
    success: (res) => {
      lastResult.value = `GET ${res.statusCode}: ${brief((res.data as any)?.headers ?? res.data)}`
    },
    fail: (err) => {
      lastResult.value = `GET 失败: ${err.errMsg}`
    },
    complete: () => {
      requesting.value = false
    },
  })
}

async function firePost() {
  requesting.value = true
  lastResult.value = 'POST 请求中…'
  try {
    const res = await uni.request({
      url: 'https://httpbin.org/post',
      method: 'POST',
      data: { source: 'uni-devtools-playground', at: Date.now() },
      header: { 'content-type': 'application/json' },
    })
    lastResult.value = `POST ${res.statusCode}: ${brief((res.data as any)?.json ?? res.data)}`
  }
  catch (err: any) {
    lastResult.value = `POST 失败: ${err?.errMsg ?? err}`
  }
  requesting.value = false
}

function fireFail() {
  lastResult.value = '失败请求已发出（.invalid 域必然 DNS 失败）…'
  uni.request({
    url: 'https://nonexistent.invalid/api',
    timeout: 3000,
    success: (res) => {
      lastResult.value = `意外成功: ${res.statusCode}`
    },
    fail: (err) => {
      lastResult.value = `预期失败: ${err.errMsg}`
    },
  })
}
</script>

<template>
  <view class="network-demo-card">
    <view class="title">
      Network 采集演示（W13）
    </view>
    <view class="row">
      <button size="mini" :disabled="requesting" @click="fireGet">
        GET（回调式）
      </button>
      <button size="mini" :disabled="requesting" @click="firePost">
        POST（Promise 式）
      </button>
      <button size="mini" @click="fireFail">
        必失败
      </button>
    </view>
    <view class="result">
      {{ lastResult }}
    </view>
  </view>
</template>

<style scoped>
.network-demo-card {
  margin: 24rpx;
  padding: 24rpx;
  border: 1rpx solid #e0e0e0;
  border-radius: 12rpx;
}

.title {
  font-weight: bold;
  margin-bottom: 16rpx;
}

.row {
  display: flex;
  gap: 16rpx;
  align-items: center;
}

.result {
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #666;
  word-break: break-all;
}
</style>
