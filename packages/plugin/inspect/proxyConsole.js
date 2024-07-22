/* eslint-disable unicorn/error-message */
import { stringify } from '@ungap/structured-clone/json'
import { trpc } from './trpc'

function stringifySymbolAndFunctions(obj, cache = new WeakMap()) {
  if (!obj || typeof obj !== 'object' || cache.has(obj)) {
    return obj
  }

  if (cache.get(obj)) {
    return cache.get(obj)
  }

  const newObj = Array.isArray(obj) ? [] : {}
  cache.set(obj, newObj)

  for (const key of Object.keys(obj)) {
    const value = obj[key]
    const valueType = typeof value

    if (valueType === 'function' || valueType === 'symbol') {
      newObj[key] = value.toString()
    }
    else if (valueType === 'object' && value !== null) {
      if (value instanceof Date) {
        newObj[key] = new Date(value)
      }
      else if (value instanceof RegExp) {
        newObj[key] = new RegExp(value)
      }
      else {
        newObj[key] = stringifySymbolAndFunctions(value, cache)
      }
    }
    else {
      newObj[key] = value
    }
  }

  return newObj
}

export function proxyConsole() {
  // @ts-ignore
  if (proxyConsole.proxied)
    return // 确保只设置一次代理
  // @ts-ignore
  proxyConsole.proxied = true

  const originalConsole = {}

  const handler = {
    apply(target, thisArg, argumentsList) {
      // 调用原始 console 方法
      Reflect.apply(target, thisArg, argumentsList)
      const newObj = stringifySymbolAndFunctions(argumentsList)
      const messages = stringify(newObj)
      /**
       * @typedef ConsoleInfo
       * @type {object}
       * @property {string} type
       * @property {string} messages
       * @property {string} stack
       */
      /**
       * @type {ConsoleInfo}
       */
      const data = {
        type: target.methodName,
        messages,
        stack: (new Error())?.stack || '',
      }
      trpc.sendConsole.subscribe(data, {
        onComplete: () => {},
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
