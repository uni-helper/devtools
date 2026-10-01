/**
 * 组件状态读写模块 (State Inspection & Mutation)
 * 支持 Options API ($data) 与 Composition API (setupState: ref / reactive)
 * 约束：纯 JSON 安全序列化、禁止使用 window/document/location 浏览器专属 API
 */

import { isRef } from 'vue'
import { getRegisteredInstance } from './tree.ts'

export interface ComponentStateField {
  type: 'ref' | 'object' | 'value'
  value: unknown
}

export interface ComponentStateResult {
  id: string
  name: string
  data: Record<string, unknown>
  setup: Record<string, ComponentStateField>
}

export interface UpdateStateParams {
  id: string
  key: string
  value: unknown
}

export interface UpdateStateResult {
  ok: true
  key: string
  value: unknown
}

/**
 * 判断是否为 ref（兼容 Vue isRef、__v_isRef 标识与含 value 属性的响应式对象）
 */
function checkIsRef(val: any): boolean {
  if (val && typeof val === 'object') {
    if (val.__v_isRef === true) {
      return true
    }
    try {
      if (isRef(val)) {
        return true
      }
    }
    catch {
      // 容错环境无 Vue 导出
    }
    if ('value' in val) {
      return true
    }
  }
  return false
}

/**
 * 递归清洗非纯 JSON 可序列化数据，消除循环引用与特殊对象
 */
function toSafeJsonValue(val: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (val === null || val === undefined) {
    return val
  }

  const t = typeof val
  if (t === 'number' || t === 'boolean' || t === 'string') {
    return val
  }

  if (t === 'bigint') {
    return String(val)
  }

  if (t === 'function' || t === 'symbol') {
    return '<unserializable>'
  }

  if (depth > 6) {
    return '<max-depth-reached>'
  }

  if (typeof val === 'object') {
    if (seen.has(val as object)) {
      return '<circular-reference>'
    }
    seen.add(val as object)

    if (Array.isArray(val)) {
      return val.map(item => toSafeJsonValue(item, depth + 1, seen))
    }

    if (val instanceof Date) {
      return val.toISOString()
    }

    if (val instanceof RegExp) {
      return val.toString()
    }

    if (val instanceof Error) {
      return { name: val.name, message: val.message }
    }

    const out: Record<string, unknown> = {}
    for (const key of Object.keys(val)) {
      if (key.startsWith('_') || key.startsWith('$')) {
        continue
      }
      try {
        const propVal = (val as any)[key]
        if (typeof propVal === 'function') {
          continue
        }
        out[key] = toSafeJsonValue(propVal, depth + 1, seen)
      }
      catch {
        out[key] = '<unserializable>'
      }
    }
    return out
  }

  return '<unserializable>'
}

/**
 * 确保值能成功通过 JSON.stringify / JSON.parse
 */
function ensureJsonSafe(value: unknown): unknown {
  try {
    const cleaned = toSafeJsonValue(value)
    return JSON.parse(JSON.stringify(cleaned))
  }
  catch {
    return '<unserializable>'
  }
}

/**
 * 读取组件状态
 */
export function getComponentState(id: string): ComponentStateResult {
  if (!id) {
    throw new Error('[getComponentState] Missing component id')
  }

  const vm = getRegisteredInstance(id)
  if (!vm) {
    throw new Error(`[getComponentState] Component with id "${id}" not found in registry`)
  }

  try {
    const internal = vm.$ || vm
    const typeObj = internal.type || (internal.$ && internal.$.type) || {}
    const name = String(typeObj.name || typeObj.__name || typeObj.displayName || 'Anonymous')

    const data: Record<string, unknown> = {}
    const setup: Record<string, ComponentStateField> = {}

    // 1. Options API 状态 ($data)
    const rawData = vm.$data || internal.data
    if (rawData && typeof rawData === 'object') {
      for (const key of Object.keys(rawData)) {
        if (key.startsWith('_') || key.startsWith('$')) {
          continue
        }
        try {
          const val = rawData[key]
          if (typeof val === 'function') {
            continue
          }
          data[key] = ensureJsonSafe(val)
        }
        catch {
          data[key] = '<unserializable>'
        }
      }
    }

    // 2. Composition API 状态 (setupState)
    const rawSetup = internal.setupState || (vm.$ && vm.$.setupState) || vm.setupState
    if (rawSetup && typeof rawSetup === 'object') {
      for (const key of Object.keys(rawSetup)) {
        if (key.startsWith('_') || key.startsWith('$')) {
          continue
        }
        try {
          const binding = rawSetup[key]
          if (typeof binding === 'function') {
            continue
          }

          if (checkIsRef(binding)) {
            setup[key] = {
              type: 'ref',
              value: ensureJsonSafe(binding.value),
            }
          }
          else if (typeof binding === 'object' && binding !== null) {
            setup[key] = {
              type: 'object',
              value: ensureJsonSafe(binding),
            }
          }
          else {
            setup[key] = {
              type: 'value',
              value: ensureJsonSafe(binding),
            }
          }
        }
        catch {
          setup[key] = {
            type: 'value',
            value: '<unserializable>',
          }
        }
      }
    }

    return {
      id: String(id),
      name,
      data,
      setup,
    }
  }
  catch (err: any) {
    throw new Error(`[getComponentState] Failed to get state for component "${id}": ${err?.message || err}`)
  }
}

/**
 * 修改组件状态
 */
export function updateComponentState(params: UpdateStateParams): UpdateStateResult {
  const { id, key, value } = params || {}
  if (!id) {
    throw new Error('[updateComponentState] Missing component id')
  }
  if (!key) {
    throw new Error('[updateComponentState] Missing state key')
  }

  const vm = getRegisteredInstance(id)
  if (!vm) {
    throw new Error(`[updateComponentState] Component with id "${id}" not found in registry`)
  }

  try {
    const internal = vm.$ || vm
    const setupState = internal.setupState || (vm.$ && vm.$.setupState) || vm.setupState

    // 1. 优先检查 Composition API (setupState)
    if (setupState && key in setupState) {
      const binding = setupState[key]

      // (1) ref 场景：直接赋值给 .value
      if (checkIsRef(binding)) {
        binding.value = value
        return { ok: true, key, value }
      }

      // (2) reactive / 对象场景：Object.assign 保持响应式代理引用
      if (typeof binding === 'object' && binding !== null) {
        if (typeof value === 'object' && value !== null) {
          Object.assign(binding, value)
          return { ok: true, key, value }
        }
        else {
          throw new Error(`[updateComponentState] Cannot assign non-object value to reactive/object key "${key}" on component "${id}"`)
        }
      }

      // (3) 纯值场景：setupState 是 proxyRefs 代理——读取时 ref 已被解包成纯值
      //（所以上面读到的 type 是 'value'），但通过代理 SET 会穿透写回底层 ref
      // 的 .value（vue3 proxyRefs 的 setter 语义）。这是 uni-app options+setup
      // 组件（如 CompositionScript.vue）状态编辑的关键写路径。
      setupState[key] = value
      return { ok: true, key, value }
    }

    // 2. 检查 Options API ($data)
    const data = vm.$data || internal.data
    if (data && key in data) {
      data[key] = value
      return { ok: true, key, value }
    }

    throw new Error(`[updateComponentState] Key "${key}" not found on component "${id}"`)
  }
  catch (err: any) {
    throw new Error(`[updateComponentState] Failed to update key "${key}" on component "${id}": ${err?.message || err}`)
  }
}
