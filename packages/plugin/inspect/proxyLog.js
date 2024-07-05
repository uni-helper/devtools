/* eslint-disable unicorn/error-message */
export function proxyLog() {
  if (proxyLog.proxied)
    return // 确保只设置一次代理
  proxyLog.proxied = true

  const originalConsole = {} // 用于存储原始 console 方法

  const handler = {
    apply(target, thisArg, argumentsList) {
      // 调用原始 console 方法
      Reflect.apply(target, thisArg, argumentsList)

      // 将信息发送到后端
      const port = __UNI_DEVTOOLS_PORT__ // 确保这个变量在你的环境中是可用的
      uni.request({
        url: `http://localhost:${port}/api/log`,
        method: 'POST',
        data: {
          type: target.methodName,
          messages: argumentsList,
          stack: new Error().stack,
        },
        fail: (error) => {
          // 在这里处理请求失败的情况
          originalConsole.error('Failed to send log to backend:', error)
        },
      })
    },
  }

  // 为 console 的每个方法创建一个代理
  for (const key in console) {
    if (typeof console[key] === 'function') {
      originalConsole[key] = console[key] // 保存原始方法
      const proxyFunction = new Proxy(console[key], handler)
      proxyFunction.methodName = key // 存储方法名
      console[key] = proxyFunction
    }
  }
}
