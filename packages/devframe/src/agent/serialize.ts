/**
 * 探针共用序列化与响应式判定助手（state.ts / pinia.ts 共享）。
 * 约束：纯 JSON 安全（浏览器全局禁用由 eslint no-restricted-globals 执法）。
 */

import * as Vue from 'vue'

const vueAny = Vue as any
const vueToRaw = vueAny.toRaw || vueAny.default?.toRaw
const vueIsRef = vueAny.isRef || vueAny.default?.isRef

export function getRaw(val: any): any {
  try {
    return typeof vueToRaw === 'function' ? vueToRaw(val) : val
  }
  catch {
    return val
  }
}

/**
 * 判断是否为 ref（兼容 Vue isRef、__v_isRef 标识与含 value 属性的响应式对象）
 */
export function checkIsRef(val: any): boolean {
  if (val && typeof val === 'object') {
    if (val.__v_isRef === true) {
      return true
    }
    try {
      if (typeof vueIsRef === 'function' && vueIsRef(val)) {
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

export interface SetupBindingInfo {
  ref: boolean
  computed: boolean
  reactive: boolean
  readonly: boolean
}

/**
 * 严格镜像 kit getSetupStateType：只用 __v_isRef === true 判 ref，
 * 并结合 effect / fn / _dirty 判 computed；__v_isReactive 判 reactive；__v_isReadonly 判 readonly
 */
export function getSetupBindingInfo(val: unknown): SetupBindingInfo {
  if (val == null || typeof val !== 'object') {
    return {
      ref: false,
      computed: false,
      reactive: false,
      readonly: false,
    }
  }

  const record = val as Record<string, unknown>
  const ref = record.__v_isRef === true
  const computed = ref && (
    record.effect != null
    || typeof record.fn === 'function'
    || typeof record._dirty === 'boolean'
  )
  const reactive = record.__v_isReactive === true
  const readonly = record.__v_isReadonly === true

  return {
    ref,
    computed,
    reactive,
    readonly,
  }
}

/**
 * 读取 computed getter 源码，镜像 kit readComputedSource（截断 500 字符）
 */
export function readComputedSource(val: unknown): string | undefined {
  if (val == null || typeof val !== 'object')
    return undefined

  const record = val as Record<string, unknown>
  const effect = record.effect as Record<string, unknown> | undefined
  const source = effect
    ? (effect.raw ?? effect.fn)
    : record.fn

  if (typeof source === 'function') {
    const str = source.toString()
    return str.length > 500 ? str.slice(0, 500) : str
  }
  return undefined
}

/**
 * 递归清洗非纯 JSON 可序列化数据，消除循环引用与特殊对象
 */
export function toSafeJsonValue(val: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
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
export function ensureJsonSafe(value: unknown): unknown {
  try {
    const cleaned = toSafeJsonValue(value)
    return JSON.parse(JSON.stringify(cleaned))
  }
  catch {
    return '<unserializable>'
  }
}
