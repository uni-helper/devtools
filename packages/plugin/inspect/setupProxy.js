import { getCurrentInstance, watch } from 'vue'
import { stringify } from '@vue/devtools-kit'

/**
 *
 * @param {Record<string, *>} bindings
 */
export function setupProxy(bindings) {
  /**
   * @type {import("@trpc/client").CreateTRPCProxyClient<import("./../src/index").AppRouter>}
   */
  // @ts-ignore
  const trpc = uni.$trpc
  const instance = getCurrentInstance()
  const componentId = instance.uid

  console.log('[setupProxy] Setting up proxy for component', componentId, 'with bindings:', Object.keys(bindings))

  // 过滤掉纯函数，只保留响应式数据和对象
  const reactiveBindings = {}
  for (const key in bindings) {
    const value = bindings[key]
    // 跳过纯函数（不是 ref/reactive 对象）
    if (typeof value === 'function') {
      console.log('[setupProxy] Skipping function binding:', key)
      continue
    }
    reactiveBindings[key] = value
  }

  // 如果没有响应式数据，至少发送一个空对象表示组件已加载
  if (Object.keys(reactiveBindings).length === 0) {
    console.log('[setupProxy] No reactive bindings found for component', componentId)
    trpc.sendComponentData.subscribe(
      {
        key: '_info',
        id: componentId,
        value: stringify([{ message: 'No reactive state' }]),
      },
      {
        onComplete: () => {},
        onError: error => console.error('[setupProxy] Error sending info:', error),
      },
    )
  }

  // 监听每个 binding 的变化并发送到 DevTools
  for (const key in reactiveBindings) {
    watch(
      () => reactiveBindings[key],
      (newValue) => {
        console.log('[setupProxy] Sending data for key:', key, 'component:', componentId, 'value:', newValue)
        trpc.sendComponentData.subscribe(
          {
            key,
            // @ts-ignore
            id: componentId,
            value: stringify([newValue]),
          },
          {
            onComplete: () => {
              console.log('[setupProxy] Data sent successfully for key:', key)
            },
            onError: error => console.error('[setupProxy] Error sending data:', error),
          },
        )
      },
      { deep: true, immediate: true },
    )
  }

  // 监听来自 DevTools 的更新请求
  trpc.onUpdateComponentData.subscribe(undefined, {
    onData: (data) => {
      console.log('[setupProxy] Received update request:', data)
      if (data.id === componentId && reactiveBindings[data.key]) {
        const binding = reactiveBindings[data.key]
        console.log('[setupProxy] Updating', data.key, 'from', binding.value, 'to', data.value)
        // 检查是否是 ref 对象
        if (binding && typeof binding === 'object' && 'value' in binding) {
          binding.value = data.value
          console.log('[setupProxy] Updated ref', data.key, 'new value:', binding.value)
        }
        else {
          console.warn('[setupProxy] Cannot update non-ref binding:', data.key)
        }
      }
    },
    onError: error => console.error('[setupProxy] Error receiving update:', error),
  })
}

/**
 *
 * @param {Record<string, *>} newValue
 * @param {number} id
 */
export function positionWatchBindings(newValue, id) {
  /**
   * @type {import("@trpc/client").CreateTRPCProxyClient<import("./../src/index").AppRouter>}
   */
  // @ts-ignore
  const trpc = uni.$trpc
  for (const key in newValue) {
    trpc.sendComponentData.subscribe(
      {
        key,
        id,
        value: stringify([newValue[key]]),
      },
      {
        onComplete: () => {},
        onError: error => console.error(error),
      },
    )
  }
}

/**
 * 为 Options API 组件设置双向绑定
 * @param {*} vm - Vue 组件实例 (this)
 */
export function setupOptionsApiProxy(vm) {
  /**
   * @type {import("@trpc/client").CreateTRPCProxyClient<import("./../src/index").AppRouter>}
   */
  // @ts-ignore
  const trpc = uni.$trpc
  const componentId = vm.$.uid

  console.log('[setupOptionsApiProxy] Setting up for component', componentId)

  // 监听来自 DevTools 的更新请求
  trpc.onUpdateComponentData.subscribe(undefined, {
    onData: (data) => {
      console.log('[setupOptionsApiProxy] Received update request:', data)
      if (data.id === componentId && data.key in vm.$data) {
        const oldValue = vm.$data[data.key]
        console.log('[setupOptionsApiProxy] Updating', data.key, 'from', oldValue, 'to', data.value)
        // 直接修改 $data
        vm.$data[data.key] = data.value
        console.log('[setupOptionsApiProxy] Updated successfully, new value:', vm.$data[data.key])
      }
    },
    onError: error => console.error('[setupOptionsApiProxy] Error receiving update:', error),
  })
}
