/* eslint-disable unicorn/error-message */
import { stringify } from 'flatted'

export function proxyLog() {
  if (proxyLog.proxied)
    return // 确保只设置一次代理
  proxyLog.proxied = true

  const originalConsole = {} // 用于存储原始 console 方法
  const port = __UNI_DEVTOOLS_PORT__

  const handler = {
    apply(target, thisArg, argumentsList) {
      // 调用原始 console 方法
      Reflect.apply(target, thisArg, argumentsList)
      const messages = stringify(argumentsList)
      const data = {
        type: target.methodName,
        messages,
        stack: new Error().stack,
      }
      // 将信息发送到后端
      uni.request({
        url: `http://localhost:${port}/api/console`,
        method: 'POST',
        data,
        fail: (error) => {
          originalConsole.log(messages)
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
