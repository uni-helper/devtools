/**
 * Pinia 状态采集模块（探针侧）
 *
 * 设计取舍（对照旧版 packages/plugin/inspect/piniaProxy.js 的 pinia 插件注入方案）：
 * 不注入任何用户代码，直接从 app 实例定位 pinia（`$pinia` 挂在 appContext
 * globalProperties，pinia.install 标准行为），枚举内部 stores Map `_s`。
 * 优点：零侵入、对 setup store / options store 通吃、时序无关（查询期实时枚举，
 * 不依赖 agent 初始化早于 store 创建）。代价：拿不到 $subscribe 推送（v1 拉取式，
 * 面板选中 store 时实时读）。
 *
 * 约束：纯 JSON 可序列化输出（浏览器全局禁用由 eslint no-restricted-globals 执法，
 * 序列化与 ref 判定复用 state.ts 的助手）。
 */

import { checkIsRef, toSafeJsonValue } from './serialize.ts'

declare const getApp: any

export interface PiniaStoreSummary {
  id: string
}

export interface PiniaStoresResult {
  stores: PiniaStoreSummary[]
}

export interface PiniaStateResult {
  id: string
  /** $state 快照（顶层键 → JSON 安全值） */
  state: Record<string, unknown>
  /** getters（store 上非 state、非函数、非内建前缀的可读属性求值） */
  getters: Record<string, unknown>
}

export interface UpdatePiniaStateParams {
  id: string
  key: string
  value?: unknown
  path?: string[]
  remove?: boolean
}

export interface UpdatePiniaStateResult {
  ok: true
  id: string
  key: string
}

/** 定位 pinia 实例（app vm → appContext globalProperties.$pinia → vm.$pinia） */
export function findPinia(): any | undefined {
  try {
    const app = typeof getApp === 'function' ? getApp() : undefined
    const vm = app?.$vm ?? app
    const internal = vm?.$ || vm
    return internal?.appContext?.config?.globalProperties?.$pinia
      ?? vm?.$pinia
      ?? undefined
  }
  catch {
    return undefined
  }
}

function iterateStores(cb: (store: any, id: string) => void): void {
  const pinia = findPinia()
  const storesMap = pinia?._s
  if (!storesMap || typeof storesMap.forEach !== 'function')
    return
  storesMap.forEach((store: any, id: string) => {
    if (store)
      cb(store, id)
  })
}

/** store 列表（面板 inspectors:treeSnapshot 用） */
export function getPiniaStores(): PiniaStoresResult {
  const stores: PiniaStoreSummary[] = []
  iterateStores((store, id) => {
    stores.push({ id: String(id) })
  })
  return { stores }
}

/** getters 候选：store 自身可枚举键，排除 $state 覆盖键与内建/私有前缀 */
function collectGetterKeys(store: any, stateKeys: Set<string>): string[] {
  const out: string[] = []
  for (const key of Object.keys(store)) {
    if (key.startsWith('$') || key.startsWith('_') || stateKeys.has(key))
      continue
    if (typeof store[key] === 'function')
      continue
    out.push(key)
  }
  return out
}

export function getPiniaState(id: string): PiniaStateResult {
  if (!id)
    throw new Error('[getPiniaState] Missing store id')

  let found: any
  iterateStores((store, storeId) => {
    if (storeId === id)
      found = store
  })
  if (!found)
    throw new Error(`[getPiniaState] Store "${id}" not found (registered stores may not be created yet)`)

  const state: Record<string, unknown> = {}
  const rawState = found.$state ?? {}
  const stateKeys = new Set(Object.keys(rawState))
  for (const key of stateKeys) {
    if (key.startsWith('_') || key.startsWith('$'))
      continue
    try {
      // 防御性解 ref：真实 pinia 的 $state 经 reactive 代理天然解包，这里兜住
      // 非常规形态（如裸 ref 集合）
      const val = rawState[key]
      state[key] = toSafeJsonValue(checkIsRef(val) ? val.value : val)
    }
    catch {
      state[key] = '<unserializable>'
    }
  }

  const getters: Record<string, unknown> = {}
  for (const key of collectGetterKeys(found, stateKeys)) {
    try {
      const val = found[key]
      if (typeof val === 'function')
        continue
      getters[key] = toSafeJsonValue(checkIsRef(val) ? val.value : val)
    }
    catch {
      getters[key] = '<unserializable>'
    }
  }

  return { id: String(id), state, getters }
}

/**
 * 修改 store 状态：优先 $state 定位（保持响应式代理），ref 解包后深路径赋值。
 * store 是 reactive 实例，属性赋值即触发订阅者与视图更新。
 */
export function updatePiniaState(params: UpdatePiniaStateParams): UpdatePiniaStateResult {
  const { id, remove } = params || {}
  const path = Array.isArray(params?.path) && params.path.length > 0
    ? params.path.map(String)
    : params?.key
      ? [String(params.key)]
      : []
  const value = params?.value

  if (!id)
    throw new Error('[updatePiniaState] Missing store id')
  if (path.length === 0)
    throw new Error('[updatePiniaState] Missing state key')

  let found: any
  iterateStores((store, storeId) => {
    if (storeId === id)
      found = store
  })
  if (!found)
    throw new Error(`[updatePiniaState] Store "${id}" not found`)

  const key = path[0]!
  const target = found.$state ?? found

  if (!(key in target))
    throw new Error(`[updatePiniaState] Key "${key}" not found on store "${id}"`)

  let parent = target
  for (let i = 0; i < path.length - 1; i++) {
    let cur = parent[path[i]!]
    if (checkIsRef(cur))
      cur = cur.value
    if (cur === null || typeof cur !== 'object')
      throw new Error(`[updatePiniaState] Path "${path.slice(0, i + 1).join('.')}" is not navigable on store "${id}"`)
    parent = cur
  }
  const last = path[path.length - 1]!

  const current = parent[last]
  if (checkIsRef(current)) {
    if (remove)
      throw new Error(`[updatePiniaState] Cannot remove ref key "${key}" on store "${id}"`)
    current.value = value
  }
  else if (remove) {
    if (Array.isArray(parent) && /^\d+$/.test(last))
      parent.splice(Number(last), 1)
    else
      delete parent[last]
  }
  else if (Array.isArray(parent) && /^\d+$/.test(last)) {
    parent[Number(last)] = value
  }
  else {
    parent[last] = value
  }

  return { ok: true, id: String(id), key }
}
