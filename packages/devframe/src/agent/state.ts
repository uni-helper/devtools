/**
 * 组件状态读写模块 (State Inspection & Mutation)
 * 支持 Options API ($data) 与 Composition API (setupState: ref / reactive)
 * 约束：纯 JSON 安全序列化、禁止使用 window/document/location 浏览器专属 API
 */

import { isRef, toRaw } from 'vue'
import { getComponentDisplayName, getRegisteredInstance } from './tree.ts'

/**
 * 编译期插桩挂载闭包绑定的属性名（plugin 侧 instrument.ts 写入端）。
 * 与 socket.ts 的 STRUCTURED_CLONE_PREFIX 同理：不从 plugin 模块导入
 *（node:path 会炸 mp 构建），字面量契约两端冻结同步（HANDOFF §4）。
 */
const BINDINGS_PROP = '__uni_devtools_bindings__'

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

function getRaw(val: any): any {
  try {
    return toRaw(val)
  }
  catch {
    return val
  }
}

/**
 * 触发组件视图层更新（调用 Vue 的 $forceUpdate 或 internal.update，驱动 mpInstance.setData）
 */
export function triggerComponentUpdate(vm: any, internal: any): void {
  try {
    if (typeof vm?.$forceUpdate === 'function') {
      vm.$forceUpdate()
    }
    else if (internal?.proxy && typeof internal.proxy.$forceUpdate === 'function') {
      internal.proxy.$forceUpdate()
    }
    else if (typeof internal?.update === 'function') {
      internal.update()
    }
  }
  catch {
    // 降级静默
  }
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
 * 解析 Composition API 状态源。
 *
 * 1. 标准 `setupState`（proxyRefs 代理）：plain `<script>` 的 setup 返回
 *    bindings 对象的形态（也是 H5/官方客户端的通用形态）
 * 2. mp script setup 编译期插桩：绑定被编译器内联进 render 闭包，setup
 *    返回 render 函数 → `setupState` 为空对象；编译期已把闭包绑定的引用
 *    挂在 render 函数上（instrument.ts），这里读回——ref/reactive 是同一
 *    引用，读到的是活值，编辑直接落到原对象
 */
function resolveSetupSource(vm: any, internal: any): Record<string, any> | undefined {
  const setupState = internal?.setupState ?? (vm?.$ ? vm.$.setupState : undefined) ?? vm?.setupState
  if (setupState && typeof setupState === 'object' && Object.keys(setupState).length > 0)
    return setupState

  const render = internal?.render
  if (typeof render === 'function') {
    const bindings = render[BINDINGS_PROP]
    if (bindings && typeof bindings === 'object')
      return bindings
  }
  return undefined
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
    throw new Error(`[getComponentState] Component with id "${id}" not found in registry (may be unmounted)`)
  }

  try {
    const internal = vm.$ || vm
    const typeObj = internal.type || (internal.$ && internal.$.type) || {}
    const name = String(getComponentDisplayName(typeObj) || 'Anonymous')

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

    // 2. Composition API 状态 (setupState / 编译期捕获的闭包绑定)
    const rawSetup = resolveSetupSource(vm, internal)
    if (rawSetup && typeof rawSetup === 'object') {
      const unwrappedSetup = getRaw(rawSetup)
      for (const key of Object.keys(rawSetup)) {
        if (key.startsWith('_') || key.startsWith('$')) {
          continue
        }
        try {
          const rawBinding = unwrappedSetup?.[key]
          const binding = rawSetup[key]
          if (typeof binding === 'function') {
            continue
          }

          if (checkIsRef(rawBinding) || checkIsRef(binding)) {
            setup[key] = {
              type: 'ref',
              value: ensureJsonSafe(checkIsRef(rawBinding) ? rawBinding.value : binding.value),
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
export function updateComponentState(
  params: UpdateStateParams,
  onUpdated?: () => void,
): UpdateStateResult {
  const { id, key, value } = params || {}
  if (!id) {
    throw new Error('[updateComponentState] Missing component id')
  }
  if (!key) {
    throw new Error('[updateComponentState] Missing state key')
  }

  const vm = getRegisteredInstance(id)
  if (!vm) {
    throw new Error(`[updateComponentState] Component with id "${id}" not found in registry (may be unmounted)`)
  }

  const internal = vm.$ || vm
  if (internal?.isUnmounted) {
    throw new Error(`[updateComponentState] Component with id "${id}" has been unmounted`)
  }

  try {
    const setupState = resolveSetupSource(vm, internal)
    // 编译期捕获的闭包绑定（非 proxyRefs）：纯值绑定是闭包 const，写捕获
    // 对象不会反映到视图——如实报错，不假装成功（与面板「如实报不支持」同旨）
    const isCapturedBindings = typeof internal?.render === 'function' && internal.render[BINDINGS_PROP] === setupState
    let updated = false

    // 1. 优先检查 Composition API (setupState)
    if (setupState && key in setupState) {
      const rawSetup = getRaw(setupState)
      const rawBinding = rawSetup?.[key]
      const binding = setupState[key]

      // (1) ref 场景：直接赋值给 .value
      if (checkIsRef(rawBinding)) {
        rawBinding.value = value
        updated = true
      }
      else if (checkIsRef(binding)) {
        binding.value = value
        updated = true
      }
      // (2) reactive / 对象场景：Object.assign 保持响应式代理引用
      else if (typeof binding === 'object' && binding !== null) {
        if (typeof value === 'object' && value !== null) {
          Object.assign(binding, value)
          updated = true
        }
        else {
          throw new Error(`[updateComponentState] Cannot assign non-object value to reactive/object key "${key}" on component "${id}"`)
        }
      }
      // (3) 纯值/proxyRefs 代理穿透场景
      else {
        if (isCapturedBindings) {
          throw new Error(`[updateComponentState] Cannot edit plain-value binding "${key}" (mp 编译期内联的非响应式 const，仅 ref/reactive 绑定可编辑) on component "${id}"`)
        }
        setupState[key] = value
        updated = true
      }
    }

    // 2. 检查 Options API ($data)
    if (!updated) {
      const data = vm.$data || internal.data
      if (data && key in data) {
        data[key] = value
        updated = true
      }
    }

    if (!updated) {
      throw new Error(`[updateComponentState] Key "${key}" not found on component "${id}"`)
    }

    // 3. 关键修复：显式触发 Vue 3 重新计算并执行小程序渲染管道 (mpInstance.setData)
    triggerComponentUpdate(vm, internal)

    // 4. 回调通知
    if (onUpdated) {
      onUpdated()
    }

    return { ok: true, key, value }
  }
  catch (err: any) {
    throw new Error(`[updateComponentState] Failed to update key "${key}" on component "${id}": ${err?.message || err}`)
  }
}
