/**
 * 组件状态读写模块 (State Inspection & Mutation)
 * 支持 Options API ($data / computed) 与 Composition API (setup / setupOther / computed)
 * 约束：纯 JSON 安全序列化、禁止使用 window/document/location 浏览器专属 API
 */

import { checkIsRef, ensureJsonSafe, getRaw, getSetupBindingInfo, readComputedSource } from './serialize.ts'
import { getComponentDisplayName, getRegisteredInstance } from './tree.ts'

/**
 * 编译期插桩挂载闭包绑定的属性名（plugin 侧 instrument.ts 写入端）。
 * 与 socket.ts 的 STRUCTURED_CLONE_PREFIX 同理：不从 plugin 模块导入
 *（node:path 会炸 mp 构建），字面量契约两端冻结同步（HANDOFF §4）。
 */
const BINDINGS_PROP = '__uni_devtools_bindings__'

export interface ComponentStateEntry {
  value?: unknown // JSON 安全值（function 绑定可省略）
  stateType?: 'ref' | 'computed' | 'reactive'
  readonly?: boolean
  raw?: string // computed getter 源码（tooltip），截断 ~500 字符
  fn?: boolean // function 绑定标记（Setup (other) 段）
  fnName?: string
  fnSource?: string
  editable?: boolean // 仅 options computed 用（有 setter 才可编辑）
}

export interface ComponentStateResult {
  id: string
  name: string
  props?: Record<string, unknown>
  data?: Record<string, unknown>
  setup?: Record<string, ComponentStateEntry>
  setupOther?: Record<string, ComponentStateEntry>
  computed?: Record<string, ComponentStateEntry> // Options API computed（经 proxy 求值）
  attrs?: Record<string, unknown>
}

export interface UpdateStateParams {
  id: string
  /** 顶层键（legacy 形态；与新 path 二选一，等价 path: [key]） */
  key?: string
  value?: unknown
  /** 官方编辑 payload 的 section（props | setup | data | computed）；缺省时自动探测 */
  section?: 'props' | 'setup' | 'data' | 'computed'
  /** 完整赋值链：path[0] = 顶层键，其后为嵌套属性（官方 editState 的 path 字段） */
  path?: string[]
  /** 删除键（对象 delete / 数组按索引 splice） */
  remove?: boolean
}

export interface UpdateStateResult {
  ok: true
  key: string
  value: unknown
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
 * 遍历合并组件定义及 mixins/extends 链上的 options（仅提取 props 与 computed）
 */
function resolveMergedOptions(internal: any): Record<string, any> | undefined {
  const record = internal as Record<string, unknown>
  const raw = record.type || (record.$ && (record.$ as any).type)
  if (!raw || typeof raw !== 'object')
    return undefined

  const appContext = record.appContext || (record.$ && (record.$ as any).appContext)
  const globalMixins = appContext?.mixins
  const mixins = Array.isArray(globalMixins) ? globalMixins : []
  const ownMixins = (raw as any).mixins
  const extendsOptions = (raw as any).extends

  if (!mixins.length && !ownMixins && !extendsOptions)
    return raw as Record<string, any>

  const options: Record<string, any> = {}
  mixins.forEach((mixin: any) => {
    if (mixin != null && (typeof mixin === 'object' || typeof mixin === 'function'))
      mergeOptionGroup(options, mixin)
  })
  mergeOptionGroup(options, raw)
  return options
}

function mergeOptionGroup(to: Record<string, any>, from: any): void {
  if (typeof from === 'function')
    from = from.options
  if (!from || typeof from !== 'object')
    return

  if (from.extends)
    mergeOptionGroup(to, from.extends)
  if (Array.isArray(from.mixins)) {
    from.mixins.forEach((m: any) => mergeOptionGroup(to, m))
  }

  if (from.computed && typeof from.computed === 'object') {
    to.computed = Object.assign(to.computed || {}, from.computed)
  }
  if (from.props && typeof from.props === 'object') {
    to.props = Object.assign(to.props || {}, from.props)
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
    throw new Error(`[getComponentState] Component with id "${id}" not found in registry (may be unmounted)`)
  }

  try {
    const internal = vm.$ || vm
    const typeObj = internal.type || (internal.$ && internal.$.type) || {}
    const name = String(getComponentDisplayName(typeObj) || 'Anonymous')
    const mergedOptions = resolveMergedOptions(internal)

    // 1. Props
    const props: Record<string, unknown> = {}
    const rawProps = internal.props
    if (rawProps && typeof rawProps === 'object') {
      for (const key of Object.keys(rawProps)) {
        if (key.startsWith('_') || key.startsWith('$'))
          continue
        try {
          props[key] = ensureJsonSafe(rawProps[key])
        }
        catch {
          props[key] = '<unserializable>'
        }
      }
    }

    // 2. Computed (Options API)
    const computed: Record<string, ComponentStateEntry> = {}
    const computedOptions = mergedOptions?.computed || typeObj?.computed
    if (computedOptions && typeof computedOptions === 'object') {
      const proxy = internal.proxy || vm
      for (const key of Object.keys(computedOptions)) {
        if (key.startsWith('_') || key.startsWith('$'))
          continue
        const definition = computedOptions[key]
        let val: unknown
        try {
          val = proxy ? proxy[key] : undefined
        }
        catch {
          val = '<unserializable>'
        }
        const editable = typeof definition === 'object' && definition !== null && typeof definition.set === 'function'
        const rawSource = typeof definition === 'function'
          ? definition.toString()
          : (typeof definition?.get === 'function' ? definition.get.toString() : undefined)
        const raw = rawSource ? (rawSource.length > 500 ? rawSource.slice(0, 500) : rawSource) : undefined

        computed[key] = {
          value: ensureJsonSafe(val),
          stateType: 'computed',
          editable,
          ...(raw ? { raw } : {}),
        }
      }
    }

    // 3. Data (Options API, 排除出现在 props 或 computed 定义里的同名键)
    const data: Record<string, unknown> = {}
    const rawData = vm.$data || internal.data
    if (rawData && typeof rawData === 'object') {
      const declaredProps = mergedOptions?.props || typeObj?.props || internal.props
      for (const key of Object.keys(rawData)) {
        if (key.startsWith('_') || key.startsWith('$'))
          continue
        if (declaredProps && key in declaredProps)
          continue
        if (computedOptions && key in computedOptions)
          continue
        try {
          const val = rawData[key]
          if (typeof val === 'function')
            continue
          data[key] = ensureJsonSafe(val)
        }
        catch {
          data[key] = '<unserializable>'
        }
      }
    }

    // 4. Setup (Composition API) & Setup (other)
    const setup: Record<string, ComponentStateEntry> = {}
    const setupOther: Record<string, ComponentStateEntry> = {}
    const rawSetup = resolveSetupSource(vm, internal)
    if (rawSetup && typeof rawSetup === 'object') {
      const unwrappedSetup = getRaw(rawSetup)
      const declaredProps = internal.props || mergedOptions?.props || typeObj?.props

      for (const key of Object.keys(rawSetup)) {
        if (key.startsWith('_') || key.startsWith('$'))
          continue
        // 排除与 props 同名的绑定（镜像 collectSetupBindings）
        if (declaredProps && key in declaredProps)
          continue

        try {
          const rawBinding = unwrappedSetup?.[key]
          const binding = rawSetup[key]
          const infoRaw = getSetupBindingInfo(rawBinding)
          const infoProp = getSetupBindingInfo(binding)
          const isRef = infoRaw.ref || infoProp.ref
          const isComputed = infoRaw.computed || infoProp.computed
          const isReactive = infoRaw.reactive || infoProp.reactive
          const isReadonly = infoRaw.readonly || infoProp.readonly

          const val = binding !== undefined ? binding : rawBinding

          // 函数 / v大写前缀 / 组件样对象 -> setupOther
          const isComponentLike = val != null && typeof val === 'object' && (
            typeof val.render === 'function'
            || typeof val.__asyncLoader === 'function'
            || val.setup != null
            || val.props != null
          )
          const isOther = (!isRef && !isComputed && !isReactive) && (
            typeof val === 'function'
            || /^v[A-Z]/.test(key)
            || isComponentLike
          )

          if (isOther) {
            if (typeof val === 'function') {
              setupOther[key] = {
                fn: true,
                fnName: val.name || key,
                fnSource: val.toString().slice(0, 200),
              }
            }
            else {
              setupOther[key] = {
                value: ensureJsonSafe(val),
              }
            }
          }
          else {
            const entry: ComponentStateEntry = {}
            if (isComputed) {
              entry.stateType = 'computed'
              const refObj = infoRaw.computed ? rawBinding : binding
              const rawSource = readComputedSource(refObj)
              if (rawSource) {
                entry.raw = rawSource
              }
            }
            else if (isRef) {
              entry.stateType = 'ref'
            }
            else if (isReactive) {
              entry.stateType = 'reactive'
            }

            if (isReadonly) {
              entry.readonly = true
            }

            let displayVal: unknown
            if (infoRaw.ref) {
              displayVal = rawBinding.value
            }
            else if (infoProp.ref) {
              displayVal = binding.value
            }
            else {
              displayVal = val
            }

            entry.value = ensureJsonSafe(displayVal)
            setup[key] = entry
          }
        }
        catch {
          setup[key] = {
            value: '<unserializable>',
          }
        }
      }
    }

    // 5. Attrs
    const attrs: Record<string, unknown> = {}
    const rawAttrs = internal.attrs
    if (rawAttrs && typeof rawAttrs === 'object') {
      for (const key of Object.keys(rawAttrs)) {
        if (key.startsWith('_') || key.startsWith('$'))
          continue
        try {
          attrs[key] = ensureJsonSafe(rawAttrs[key])
        }
        catch {
          attrs[key] = '<unserializable>'
        }
      }
    }

    const result: ComponentStateResult = {
      id: String(id),
      name,
    }
    if (Object.keys(props).length > 0)
      result.props = props
    if (Object.keys(data).length > 0)
      result.data = data
    if (Object.keys(setup).length > 0)
      result.setup = setup
    if (Object.keys(setupOther).length > 0)
      result.setupOther = setupOther
    if (Object.keys(computed).length > 0)
      result.computed = computed
    if (Object.keys(attrs).length > 0)
      result.attrs = attrs

    return result
  }
  catch (err: any) {
    throw new Error(`[getComponentState] Failed to get state for component "${id}": ${err?.message || err}`)
  }
}

/**
 * 沿绑定链导航到目标父对象（逐段解 ref）。
 * setupState（proxyRefs）读值天然解包；捕获绑定里的裸 ref 需显式 .value 下钻。
 */
function navigateToParent(root: any, segments: string[], id: string): { parent: any, last: string } {
  let parent = root
  for (let i = 0; i < segments.length - 1; i++) {
    let cur = parent[segments[i]!]
    if (checkIsRef(cur))
      cur = cur.value
    if (cur === null || typeof cur !== 'object') {
      const walked = segments.slice(0, i + 1).join('.')
      throw new Error(`[updateComponentState] Path "${walked}" is not navigable on component "${id}" (got ${cur === null ? 'null' : typeof cur})`)
    }
    parent = cur
  }
  return { parent, last: segments[segments.length - 1]! }
}

/** 终段写入：ref 绑定落 .value；remove 走 delete / 数组 splice；普通对象属性直接赋值 */
function assignFinal(target: { parent: any, last: string }, value: unknown, remove: boolean | undefined, id: string): void {
  const { parent, last } = target
  const current = parent[last]

  if (checkIsRef(current)) {
    if (remove)
      throw new Error(`[updateComponentState] Cannot remove ref binding "${last}" on component "${id}"`)
    current.value = value
    return
  }

  if (remove) {
    if (Array.isArray(parent) && /^\d+$/.test(last)) {
      parent.splice(Number(last), 1)
      return
    }
    delete parent[last]
    return
  }

  if (Array.isArray(parent) && /^\d+$/.test(last)) {
    parent[Number(last)] = value
    return
  }
  parent[last] = value
}

/**
 * 修改组件状态
 */
export function updateComponentState(
  params: UpdateStateParams,
  onUpdated?: () => void,
): UpdateStateResult {
  const { id, section, remove } = params || {}
  const path = Array.isArray(params?.path) && params.path.length > 0
    ? params.path.map(String)
    : params?.key
      ? [String(params.key)]
      : []
  const value = params?.value

  if (!id) {
    throw new Error('[updateComponentState] Missing component id')
  }
  if (path.length === 0) {
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

  const key = path[0]!

  try {
    const setupState = resolveSetupSource(vm, internal)
    const data = vm.$data || internal.data
    const props = internal.props
    const proxy = internal.proxy || vm

    let updated = false

    if (section === 'props') {
      if (!props || !(key in props)) {
        throw new Error(`[updateComponentState] Key "${key}" not found in props on component "${id}"`)
      }
      assignFinal(navigateToParent(props, path, id), value, remove, id)
      updated = true
    }
    else if (section === 'computed') {
      if (!proxy || !(key in proxy)) {
        throw new Error(`[updateComponentState] Key "${key}" not found in computed proxy on component "${id}"`)
      }
      assignFinal(navigateToParent(proxy, path, id), value, remove, id)
      updated = true
    }
    else {
      // section 显式给定走官方语义；缺省保持「setup 优先、data 兜底」探测
      const useSetup = section ? section === 'setup' : !!(setupState && key in setupState)
      const useData = section ? section === 'data' : (!useSetup && !!(data && key in data))

      // 1. Composition API (setupState / 编译期捕获的闭包绑定)
      if (useSetup && setupState && key in setupState) {
        const isCapturedBindings = typeof internal?.render === 'function' && internal.render[BINDINGS_PROP] === setupState
        const binding = setupState[key]

        if (path.length === 1) {
          const rawSetup = getRaw(setupState)
          const rawBinding = rawSetup?.[key]
          // (1) ref 场景：直接赋值给 .value
          if (checkIsRef(rawBinding)) {
            if (remove)
              throw new Error(`[updateComponentState] Cannot remove ref binding "${key}" on component "${id}"`)
            rawBinding.value = value
            updated = true
          }
          else if (checkIsRef(binding)) {
            if (remove)
              throw new Error(`[updateComponentState] Cannot remove ref binding "${key}" on component "${id}"`)
            binding.value = value
            updated = true
          }
          // (2) reactive / 对象场景：Object.assign 保持响应式代理引用
          else if (typeof binding === 'object' && binding !== null) {
            if (remove) {
              delete setupState[key]
              updated = true
            }
            else if (typeof value === 'object' && value !== null) {
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
            if (remove) {
              delete setupState[key]
            }
            else {
              setupState[key] = value
            }
            updated = true
          }
        }
        else {
          // 深路径：逐段解 ref 下钻后终段属性赋值
          assignFinal(navigateToParent(setupState, path, id), value, remove, id)
          updated = true
        }
      }

      // 2. Options API ($data)
      if (!updated && useData && data && key in data) {
        if (path.length === 1) {
          if (remove) {
            delete data[key]
          }
          else {
            data[key] = value
          }
          updated = true
        }
        else {
          assignFinal(navigateToParent(data, path, id), value, remove, id)
          updated = true
        }
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

// Vue 3.5 EffectFlags.DIRTY / EVALUATED
const COMPUTED_DIRTY_FLAG = 16
const COMPUTED_EVALUATED_FLAG = 128

/**
 * 触发 computed ref 重算（镜像 kit triggerComputedRef）
 */
export function triggerComputedRef(computedRef: any): void {
  if (!computedRef || typeof computedRef !== 'object')
    return

  if (typeof computedRef.flags === 'number') {
    computedRef.flags = (computedRef.flags | COMPUTED_DIRTY_FLAG) & ~COMPUTED_EVALUATED_FLAG
    if (typeof computedRef.globalVersion === 'number')
      computedRef.globalVersion -= 1
  }

  const effect = computedRef.effect
  if (effect && typeof effect === 'object' && effect !== computedRef) {
    effect.dirty = true
  }

  if (typeof computedRef._dirty === 'boolean') {
    computedRef._dirty = true
  }

  const dep = computedRef.dep
  if (dep && typeof dep === 'object') {
    const trigger = dep.trigger
    if (typeof trigger === 'function') {
      trigger.call(dep, {
        target: computedRef,
        type: 'set',
        key: 'value',
        newValue: computedRef._value,
      })
    }
  }

  void computedRef.value
  if (typeof computedRef.flags === 'number') {
    computedRef.flags |= COMPUTED_EVALUATED_FLAG
  }
}

/**
 * 重算组件状态中的 computed 值（仅支持 setup 段）
 */
export function recomputeComponentState(
  id: string,
  section: string,
  path: string[],
): { ok: boolean } {
  if (!id) {
    throw new Error('[recomputeComponentState] Missing component id')
  }

  const vm = getRegisteredInstance(id)
  if (!vm) {
    throw new Error(`[recomputeComponentState] Component with id "${id}" not found in registry (may be unmounted)`)
  }

  if (section !== 'setup') {
    throw new Error(`[recomputeComponentState] Recompute is only supported for setup section (got "${section}")`)
  }

  if (!Array.isArray(path) || path.length !== 1) {
    throw new Error(`[recomputeComponentState] Recompute requires path of length 1 (got ${JSON.stringify(path)})`)
  }

  const key = path[0]!
  const internal = vm.$ || vm
  const setupState = resolveSetupSource(vm, internal)
  if (!setupState || !(key in setupState)) {
    throw new Error(`[recomputeComponentState] Binding "${key}" not found in setup for component "${id}"`)
  }

  const rawSetup = getRaw(setupState)
  const rawBinding = rawSetup?.[key] !== undefined ? rawSetup[key] : setupState[key]
  const binding = setupState[key]
  const target = rawBinding !== undefined ? rawBinding : binding

  const info = getSetupBindingInfo(target)
  if (!info.computed) {
    throw new Error(`[recomputeComponentState] Binding "${key}" is not a computed ref on component "${id}"`)
  }

  triggerComputedRef(target)
  triggerComponentUpdate(vm, internal)
  return { ok: true }
}
