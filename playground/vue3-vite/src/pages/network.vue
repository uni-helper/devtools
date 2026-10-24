<script setup lang="ts">
import PageIntro from '@/components/PageIntro.vue'

const lastResult = ref('（尚未发起请求）')

function brief(data: unknown): string {
  return JSON.stringify(data)?.slice(0, 80) ?? String(data)
}

function requestWithCallback() {
  uni.request({
    url: 'https://httpbin.org/get?from=callback',
    success: res => (lastResult.value = `GET ${res.statusCode}`),
    fail: err => (lastResult.value = `GET 失败：${err.errMsg}`),
  })
}

async function requestWithPromise() {
  try {
    const res = await uni.request({
      url: 'https://httpbin.org/post',
      method: 'POST',
      data: { source: 'playground', step: 1 },
    })
    lastResult.value = `POST ${res.statusCode}：${brief((res.data as { json?: unknown }).json)}`
  }
  catch (err) {
    lastResult.value = `POST 失败：${brief(err)}`
  }
}

function requestThatFails() {
  // .invalid 顶级域名保证 DNS 失败：没有外网也一定能产生一条失败记录
  uni.request({
    url: 'https://nonexistent.invalid/api',
    timeout: 3000,
    fail: err => (lastResult.value = `预期失败：${err.errMsg}`),
  })
}
</script>

<template>
  <view class="page">
    <PageIntro
      title="网络请求"
      :checks="[
        'Network 页签：每点一次按钮多一条记录',
        '回调式 GET 与 Promise 式 POST 都显示 200；POST 的请求体为 {source, step}',
        '「必失败」显示为 FAIL，错误信息包含 request:fail',
      ]"
    />
    <view class="card">
      <view class="btn" @click="requestWithCallback">
        GET（回调式）
      </view>
      <view class="btn" @click="requestWithPromise">
        POST（Promise 式）
      </view>
      <view class="btn" @click="requestThatFails">
        必失败
      </view>
      <view class="kv">
        {{ lastResult }}
      </view>
    </view>
  </view>
</template>
