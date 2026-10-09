/**
 * Vuex 状态嗅探与操作（Vue 2 探针专用）
 *
 * 三级降级策略：
 * 1. getApp().$vm.$store (uni-app 小程序主实例)
 * 2. getApp().$store (某些版本直接挂载)
 * 3. Vue.prototype.$store (标准 Vue.js 全局挂载)
 */

import type {
  VuexStateResult,
  UpdateVuexStateParams,
} from '@uni-helper/devtools-shared'

declare const getApp: any
declare const Vue: any

/**
 * 零侵入探测 Vuex store 实例
 * 使用三级降级策略确保在 uni-app 小程序环境中可靠定位
 */
export function findVuexStore(): any | undefined {
  try {
    const app = typeof getApp === 'function' ? getApp() : undefined
    return (
      app?.$vm?.$store ??
      app?.$store ??
      (typeof Vue !== 'undefined'
        ? (Vue as any).prototype?.$store
        : undefined) ??
      // 补充降级：从 window.Vue 读取（修复 CR N2）
      (typeof window !== 'undefined' && (window as any).Vue?.prototype?.$store)
    )
  } catch {
    return undefined
  }
}

/**
 * 提取 root store 的 getters（带错误隔离）
 */
export function extractGetters(store: any): Record<string, unknown> {
  const getters: Record<string, unknown> = {}
  try {
    for (const key in store.getters) {
      try {
        getters[key] = store.getters[key]
      } catch (e: any) {
        getters[key] = `<error: ${e.message || 'unknown'}>`
      }
    }
  } catch {
    // 整体访问失败，返回空对象
  }
  return getters
}

/**
 * 提取指定 module 的 namespaced getters
 * Namespaced getters 格式：'modulePath/getterName'
 */
export function extractModuleGetters(
  store: any,
  modulePath: string,
): Record<string, unknown> {
  const getters: Record<string, unknown> = {}
  const prefix = modulePath + '/'

  try {
    for (const key in store.getters) {
      if (key.startsWith(prefix)) {
        const getterName = key.slice(prefix.length)
        try {
          getters[getterName] = store.getters[key]
        } catch (e: any) {
          getters[getterName] = `<error: ${e.message || 'unknown'}>`
        }
      }
    }
  } catch {
    // 整体访问失败，返回空对象
  }

  return getters
}

/**
 * 递归收集所有 modules（扁平化平级节点）
 * 修复 CR M1-B: 添加深度限制和循环引用检测
 * 修复 Critical 3: 改用 getModuleState 读取运行时响应式状态
 */
export function collectModules(
  store: any,
  rootModule: any,
  path = '',
  depth = 0,
  visited = new Set<any>(),
): Array<{ path: string; state: any; namespaced: boolean }> {
  const results: Array<{ path: string; state: any; namespaced: boolean }> = []

  // 深度限制（防止调用栈溢出）
  if (depth > 50) return results

  // 循环引用检测
  if (visited.has(rootModule)) return results
  visited.add(rootModule)

  try {
    if (rootModule._children) {
      for (const [key, childModule] of Object.entries(
        rootModule._children as Record<string, any>,
      )) {
        const modulePath = path ? `${path}/${key}` : key

        results.push({
          path: modulePath,
          // 修复 Critical 3: 使用 getModuleState 读取运行时响应式状态
          state: getModuleState(store, modulePath),
          namespaced: !!childModule.namespaced,
        })

        // 递归收集子模块
        results.push(
          ...collectModules(store, childModule, modulePath, depth + 1, visited),
        )
      }
    }
  } catch {
    // 模块遍历失败，返回已收集的结果
  }

  return results
}

/**
 * 获取指定 module 的 state
 */
export function getModuleState(store: any, modulePath: string): any {
  try {
    const parts = modulePath.split('/')
    let state = store.state
    for (const part of parts) {
      state = state[part]
      if (!state) return {}
    }
    return state
  } catch {
    return {}
  }
}

/**
 * 按路径设置值（支持嵌套路径）
 */
export function setValueByPath(
  obj: any,
  path: string[],
  value: unknown,
  remove = false,
): void {
  if (path.length === 0) return

  const lastKey = path[path.length - 1]
  let target = obj

  // 遍历到倒数第二层
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if (!(key in target)) {
      target[key] = {}
    }
    target = target[key]
  }

  // 删除或设置值
  if (remove) {
    // 修复 CR M2-A：支持删除操作
    if (typeof Vue !== 'undefined' && (Vue as any).delete) {
      ;(Vue as any).delete(target, lastKey)
    } else {
      delete target[lastKey]
    }
  } else {
    // 使用 Vue.set 确保响应式更新
    if (typeof Vue !== 'undefined' && (Vue as any).set) {
      ;(Vue as any).set(target, lastKey, value)
    } else {
      target[lastKey] = value
    }
  }
}

/**
 * 获取所有 Vuex stores（root + modules）
 * 修复 Critical 3: 使用 getModuleState 读取实时响应式状态
 */
export function getVuexStores(): VuexStateResult[] {
  const store = findVuexStore()
  if (!store) return []

  const results: VuexStateResult[] = []

  try {
    // Root store
    results.push({
      id: '_root',
      state: store.state || {},
      getters: extractGetters(store),
      namespaced: false,
    })

    // Namespaced modules（实时枚举，修复 Critical 3）
    const modules = collectModules(store, store._modules?.root)
    for (const mod of modules) {
      results.push({
        id: mod.path,
        state: mod.state, // 已经是响应式状态
        getters: extractModuleGetters(store, mod.path),
        namespaced: mod.namespaced,
      })
    }
  } catch {
    // 收集失败，返回已有结果（Fail-Open）
  }

  return results
}

/**
 * 编辑 Vuex state（使用 _withCommit 绕过严格模式）
 * 修复 CR M2-B：完善降级方案（临时关闭严格模式）
 */
export function updateVuexState(params: UpdateVuexStateParams): {
  ok: boolean
} {
  const store = findVuexStore()
  if (!store) {
    throw new Error('Vuex store not found')
  }

  const { id, path, value, remove } = params

  // 应用变更的函数
  const applyChange = () => {
    const target = id === '_root' ? store.state : getModuleState(store, id)
    setValueByPath(target, [...path], value, remove)
  }

  // 优先使用 _withCommit 绕过严格模式
  if (typeof store._withCommit === 'function') {
    store._withCommit(applyChange)
  } else {
    // 降级方案：临时关闭严格模式（修复 CR M2-B）
    const wasStrict = store.strict
    try {
      if (wasStrict && typeof store.strict !== 'undefined') {
        store.strict = false
      }
      applyChange()
    } finally {
      if (wasStrict && typeof store.strict !== 'undefined') {
        store.strict = true
      }
    }
  }

  return { ok: true }
}
