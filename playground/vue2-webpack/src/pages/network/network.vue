<template>
  <view class="container">
    <view class="title">Network Test</view>
    <button @click="testRequest" type="primary">Test uni.request</button>
    <button @click="testWxRequest" type="warn" style="margin-top: 20px;">Test wx.request (direct)</button>
    <button @click="testMultiple" type="default" style="margin-top: 20px;">Test Multiple Requests</button>
    <view class="result">{{ result }}</view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      result: '点击按钮测试网络请求'
    }
  },

  onLoad() {
    console.log('[network-test] Page loaded')
    // 延迟发起一个测试请求
    setTimeout(() => {
      console.log('[network-test] Sending delayed request...')
      this.testRequest()
    }, 1000)
  },

  methods: {
    testRequest() {
      console.log('[network-test] Sending request...')
      this.result = '请求中...'

      uni.request({
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
        success: (res) => {
          console.log('[network-test] Request success:', res)
          this.result = `成功: ${JSON.stringify(res.data).slice(0, 100)}...`
        },
        fail: (err) => {
          console.log('[network-test] Request failed:', err)
          this.result = `失败: ${err.errMsg}`
        }
      })
    },

    // 直调 wx.request（绕过 uni）：验证探针的 wx 降级拦截。
    // 注意：wx.request 必须带 success/fail 回调——微信基座不提供 Promise 式返回。
    testWxRequest() {
      if (typeof wx === 'undefined' || typeof wx.request !== 'function') {
        this.result = '当前环境无 wx.request，跳过'
        return
      }
      console.log('[network-test] Sending wx.request directly...')
      this.result = 'wx.request 请求中...'

      wx.request({
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
        success: (res) => {
          console.log('[network-test] wx.request success:', res)
          this.result = `wx 成功: ${JSON.stringify(res.data).slice(0, 100)}...`
        },
        fail: (err) => {
          console.log('[network-test] wx.request failed:', err)
          this.result = `wx 失败: ${err.errMsg}`
        }
      })
    },

    testMultiple() {
      console.log('[network-test] Sending multiple requests...')
      this.result = '发送多个请求中...'

      // 发送多个请求
      for (let i = 1; i <= 3; i++) {
        uni.request({
          url: `https://jsonplaceholder.typicode.com/posts/${i}`,
          method: 'GET',
          success: (res) => {
            console.log(`[network-test] Request ${i} success`)
          },
          fail: (err) => {
            console.log(`[network-test] Request ${i} failed:`, err)
          }
        })
      }

      this.result = '已发送3个请求，查看 Network 面板'
    }
  }
}
</script>

<style scoped>
.container {
  padding: 20px;
}

.title {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 20px;
}

.result {
  margin-top: 20px;
  padding: 10px;
  background-color: #f0f0f0;
  border-radius: 5px;
  min-height: 100px;
}
</style>
