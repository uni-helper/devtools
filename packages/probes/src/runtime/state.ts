/**
 * 组件状态读写模块 (State Inspection & Mutation)
 * 支持 Options API ($data / computed) 与 Composition API (setup / setupOther / computed)
 * 约束：纯 JSON 安全序列化（浏览器全局禁用由 eslint no-restricted-globals 执法）
 */

import { BINDINGS_PROP } from '@uni-helper/devtools-shared'
import type {
  ComponentStateEntry,
  ComponentStateResult,
} from '@uni-helper/devtools-shared'
import {
  checkIsRef,
  ensureJsonSafe,
  getRaw,
  getSetupBindingInfo,
  readComputedSource,
} from './serialize.ts'
import { buildReactivityGraph } from './reactivity-graph.ts'
import { getComponentDisplayName, getRegisteredInstance } from './tree.ts'
import {
  deleteReactive,
  getAttrs,
  getData,
  getInternal,
  getOptions,
  getProps,
  getProxy,
  isInstanceDestroyed,
  setReactive,
} from './instance.ts'

// 结果形态即 wire 契约（types.ts 单点定义，探针侧不再复制镜像）

export type { ComponentStateEntry, ComponentStateResult }

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
 * 检查 key 是否在 props 声明中（支持数组和对象形式）
 */
function isDeclaredProp(key: string, declaredProps: unknown): boolean {
  if (!declaredProps) return false
  if (Array.isArray(declaredProps)) return declaredProps.includes(key)
  if (typeof declaredProps === 'object')
    return key in (declaredProps as Record<string, unknown>)
  return false
}

/**
 * 触发组件视图层更新——响应式变更不会自动驱动 mp 渲染管道，需显式走到
 * $forceUpdate / internal.update（底层即 mpInstance.setData）
 */
export function triggerComponentUpdate(vm: any, internal: any): void {
  try {
    if (typeof vm?.$forceUpdate === 'function') {
      vm.$forceUpdate()
    } else if (
      internal?.proxy &&
      typeof internal.proxy.$forceUpdate === 'function'
    ) {
      internal.proxy.$forceUpdate()
    } else if (typeof internal?.update === 'function') {
      internal.update()
    }
  } catch {
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
function resolveSetupSource(
  vm: any,
  internal: any,
): Record<string, any> | undefined {
  // Vue 3：`internal.setupState`；Vue 2.7：`vm._setupState`；Vue 2.6：两者皆无 → undefined
  // （2.6 的 Options API 走 $data / $options.computed 两段，不需要 setup 段）
  const setupState = internal?.setupState ?? vm?.setupState ?? vm?._setupState
  if (
    setupState &&
    typeof setupState === 'object' &&
    Object.keys(setupState).length > 0
  )
    return setupState

  const render = internal?.render
  if (typeof render === 'function') {
    const bindings = render[BINDINGS_PROP]
    if (bindings && typeof bindings === 'object') return bindings
  }
  return undefined
}

/**
 * 遍历合并组件定义及 mixins/extends 链上的 options（仅提取 props 与 computed）
 */
function resolveMergedOptions(vm: any): Record<string, any> | undefined {
  const internal = getInternal(vm)
  const raw = getOptions(vm)
  if (!raw || typeof raw !== 'object') return undefined

  // Vue 2 的 `$options` 在实例化时已由 Vue 的 mergeOptions 合并过 mixins/extends，
  // 这里直接用它，不能重跑一遍合并
  if (!internal?.appContext) return raw as Record<string, any>

  const globalMixins = internal.appContext?.mixins
  const mixins = Array.isArray(globalMixins) ? globalMixins : []
  const ownMixins = (raw as any).mixins
  const extendsOptions = (raw as any).extends

  if (!mixins.length && !ownMixins && !extendsOptions)
    return raw as Record<string, any>

  const options: Record<string, any> = {}
  mixins.forEach((mixin: any) => {
    if (
      mixin != null &&
      (typeof mixin === 'object' || typeof mixin === 'function')
    )
      mergeOptionGroup(options, mixin)
  })
  mergeOptionGroup(options, raw)
  return options
}

function mergeOptionGroup(to: Record<string, any>, from: any): void {
  if (typeof from === 'function') from = from.options
  if (!from || typeof from !== 'object') return

  if (from.extends) mergeOptionGroup(to, from.extends)
  if (Array.isArray(from.mixins)) {
    from.mixins.forEach((m: any) => mergeOptionGroup(to, m))
  }

  if (from.computed && typeof from.computed === 'object') {
    to.computed = Object.assign(to.computed || {}, from.computed)
  }
  if (from.props) {
    to.props = to.props || {}
    if (Array.isArray(from.props)) {
      for (const prop of from.props) {
        if (typeof prop === 'string') to.props[prop] = null
      }
    } else if (typeof from.props === 'object') {
      Object.assign(to.props, from.props)
    }
  }
}

export function getComponentState(id: string): ComponentStateResult {
  if (!id) {
    throw new Error('[getComponentState] Missing component id')
  }

  const vm = getRegisteredInstance(id)
  if (!vm) {
    throw new Error(
      `[getComponentState] Component with id "${id}" not found in registry (may be unmounted)`,
    )
  }

  try {
    const internal = getInternal(vm)
    const typeObj = getOptions(vm)
    const name = String(getComponentDisplayName(typeObj) || 'Anonymous')
    const mergedOptions = resolveMergedOptions(vm)

    const props: Record<string, unknown> = {}
    const rawProps = getProps(vm)
    if (rawProps && typeof rawProps === 'object') {
      for (const key of Object.keys(rawProps)) {
        if (key.startsWith('_') || key.startsWith('$')) continue
        try {
          props[key] = ensureJsonSafe(rawProps[key])
        } catch {
          props[key] = '<unserializable>'
        }
      }
    }

    // Options API computed（经 proxy 求值，区别于 setup 段的 computed ref）
    const computed: Record<string, ComponentStateEntry> = {}
    const computedOptions = mergedOptions?.computed || typeObj?.computed
    if (computedOptions && typeof computedOptions === 'object') {
      const proxy = getProxy(vm)
      for (const key of Object.keys(computedOptions)) {
        if (key.startsWith('_') || key.startsWith('$')) continue
        const definition = computedOptions[key]
        let val: unknown
        try {
          val = proxy ? proxy[key] : undefined
        } catch {
          val = '<unserializable>'
        }
        const editable =
          typeof definition === 'object' &&
          definition !== null &&
          typeof definition.set === 'function'
        const rawSource =
          typeof definition === 'function'
            ? definition.toString()
            : typeof definition?.get === 'function'
              ? definition.get.toString()
              : undefined
        const raw = rawSource
          ? rawSource.length > 500
            ? rawSource.slice(0, 500)
            : rawSource
          : undefined

        computed[key] = {
          value: ensureJsonSafe(val),
          stateType: 'computed',
          editable,
          ...(raw ? { raw } : {}),
        }
      }
    }

    // $data 中排除与 props / computed 同名的键，避免跨段重复展示
    const data: Record<string, unknown> = {}
    const rawData = getData(vm)
    if (rawData && typeof rawData === 'object') {
      const declaredProps =
        mergedOptions?.props || typeObj?.props || getProps(vm)
      for (const key of Object.keys(rawData)) {
        if (key.startsWith('_') || key.startsWith('$')) continue
        if (declaredProps && key in declaredProps) continue
        if (computedOptions && key in computedOptions) continue
        try {
          const val = rawData[key]
          if (typeof val === 'function') continue
          data[key] = ensureJsonSafe(val)
        } catch {
          data[key] = '<unserializable>'
        }
      }
    }

    // Setup (Composition API) 分两个视图段：setup / setupOther
    const setup: Record<string, ComponentStateEntry> = {}
    const setupOther: Record<string, ComponentStateEntry> = {}
    const rawSetup = resolveSetupSource(vm, internal)
    if (rawSetup && typeof rawSetup === 'object') {
      const unwrappedSetup = getRaw(rawSetup)
      const declaredProps =
        mergedOptions?.props || typeObj?.props || getProps(vm)
      const computedOptions = mergedOptions?.computed || typeObj?.computed

      for (const key of Object.keys(rawSetup)) {
        if (key.startsWith('_') || key.startsWith('$')) continue
        // 排除与 props 同名的绑定（镜像 collectSetupBindings）
        if (isDeclaredProp(key, declaredProps)) continue
        // 排除与 computed 同名的绑定
        if (computedOptions && key in computedOptions) continue

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
          const isComponentLike =
            val != null &&
            typeof val === 'object' &&
            (typeof val.render === 'function' ||
              typeof val.__asyncLoader === 'function' ||
              val.setup != null ||
              val.props != null)
          const isOther =
            !isRef &&
            !isComputed &&
            !isReactive &&
            (typeof val === 'function' ||
              /^v[A-Z]/.test(key) ||
              isComponentLike)

          if (isOther) {
            if (typeof val === 'function') {
              setupOther[key] = {
                fn: true,
                fnName: val.name || key,
                fnSource: val.toString().slice(0, 200),
              }
            } else {
              setupOther[key] = {
                value: ensureJsonSafe(val),
              }
            }
          } else {
            const entry: ComponentStateEntry = {}
            if (isComputed) {
              entry.stateType = 'computed'
              const refObj = infoRaw.computed ? rawBinding : binding
              const rawSource = readComputedSource(refObj)
              if (rawSource) {
                entry.raw = rawSource
              }
              const hasSetter =
                typeof (refObj as any)?.setter === 'function' ||
                typeof (refObj as any)?.set === 'function'
              entry.editable = hasSetter && !isReadonly
            } else if (isRef) {
              entry.stateType = 'ref'
              entry.editable = !isReadonly
            } else if (isReactive) {
              entry.stateType = 'reactive'
              entry.editable = !isReadonly
            }

            if (isReadonly || (isComputed && !entry.editable)) {
              entry.readonly = true
            }

            let displayVal: unknown
            if (infoRaw.ref) {
              displayVal = rawBinding.value
            } else if (infoProp.ref) {
              displayVal = binding.value
            } else {
              displayVal = val
            }

            entry.value = ensureJsonSafe(displayVal)
            setup[key] = entry
          }
        } catch {
          setup[key] = {
            value: '<unserializable>',
          }
        }
      }
    }

    const attrs: Record<string, unknown> = {}
    const rawAttrs = getAttrs(vm)
    if (rawAttrs && typeof rawAttrs === 'object') {
      for (const key of Object.keys(rawAttrs)) {
        if (key.startsWith('_') || key.startsWith('$')) continue
        try {
          attrs[key] = ensureJsonSafe(rawAttrs[key])
        } catch {
          attrs[key] = '<unserializable>'
        }
      }
    }

    // Reactivity Graph：与 Setup 面板共用同一 setup 源（真 setupState 或 mp
    // 编译期捕获的闭包绑定），图数据搭 state 快照便车下发；无响应式绑定
    // 时省略字段（面板侧缺省即空图，与官方 kit 行为一致）
    const reactivityGraph = buildReactivityGraph(rawSetup)

    const result: ComponentStateResult = {
      id: String(id),
      name,
    }
    if (Object.keys(props).length > 0) result.props = props
    if (Object.keys(data).length > 0) result.data = data
    if (Object.keys(setup).length > 0) result.setup = setup
    if (Object.keys(setupOther).length > 0) result.setupOther = setupOther
    if (Object.keys(computed).length > 0) result.computed = computed
    if (Object.keys(attrs).length > 0) result.attrs = attrs
    if (reactivityGraph.nodes.length > 0)
      result.reactivityGraph = reactivityGraph

    return result
  } catch (err: any) {
    throw new Error(
      `[getComponentState] Failed to get state for component "${id}": ${err?.message || err}`,
    )
  }
}

function previewEditValue(value: unknown): string {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    if (text === undefined) return String(value)
    return text.length > 60 ? `${text.slice(0, 60)}…` : text
  } catch {
    return '<unprintable>'
  }
}

/**
 * 沿绑定链导航到目标父对象（逐段解 ref）。
 * setupState（proxyRefs）读值天然解包；捕获绑定里的裸 ref 需显式 .value 下钻。
 */
function navigateToParent(
  root: any,
  segments: string[],
  id: string,
): { parent: any; last: string } {
  let parent = root
  for (let i = 0; i < segments.length - 1; i++) {
    let cur = parent[segments[i]!]
    if (checkIsRef(cur)) cur = cur.value
    if (cur === null || typeof cur !== 'object') {
      const walked = segments.slice(0, i + 1).join('.')
      const at = segments.slice(0, i).join('.') || '<root>'
      const siblings =
        parent && typeof parent === 'object'
          ? Object.keys(parent).slice(0, 12).join(',')
          : '-'
      // 路径与对象形状不一致时，只报 typeof 无法定位；一并带出取值与同级键辅助排查。
      throw new Error(
        `[updateComponentState] Path "${walked}" is not navigable on component "${id}"` +
          ` (got ${cur === null ? 'null' : typeof cur}: ${previewEditValue(cur)};` +
          ` keys of "${at}": ${siblings})`,
      )
    }
    parent = cur
  }
  return { parent, last: segments[segments.length - 1]! }
}

/**
 * mp 运行时下把 props 写进宿主小程序的 `properties`。
 *
 * 为什么不能只写 Vue 侧：mp-vue 的 setData 载荷（`cloneWithData`）不含 props，
 * 所以写 `vm.$props` 后即使重渲染也到不了视图；而且宿主 properties 的 observer
 * 会在父组件更新时把 `vm._props` 覆写回去，编辑静默丢失。
 *
 * 写宿主侧则两头都通：`setData` 直接驱动视图，observer 再回流到 `vm._props`。
 *
 * 一律按**顶层 prop 整值替换**写入。宿主对 `properties` 子路径的 setData 语义不明确
 * （实测 `setData({'item.done': v})` 会把整个 `item` 写坏成字符串）；整值写入走的是
 * 已验证可用的顶层链路。嵌套值在探针侧先应用到浅拷贝链上，再整体下发。
 *
 * @returns 是否已写入宿主；false 表示非 mp 运行时，调用方按原路径处理
 */
function setPropOnMpHost(
  vm: any,
  props: any,
  path: string[],
  value: unknown,
): boolean {
  const scope = vm?.$scope
  if (!scope || typeof scope.setData !== 'function' || path.length === 0) {
    return false
  }

  const key = path[0]!
  let next: unknown
  try {
    next =
      path.length === 1
        ? value
        : applyPathValue(props?.[key], path.slice(1), value)
  } catch {
    return false
  }

  try {
    scope.setData({ [key]: next })
    return true
  } catch {
    // 宿主拒收时退回纯 Vue 侧写入，至少保证面板读数一致
    return false
  }
}

function applyPathValue(
  root: any,
  segments: string[],
  value: unknown,
): unknown {
  if (segments.length === 0) {
    return value
  }
  const [head, ...rest] = segments
  const base: any = Array.isArray(root) ? root.slice() : { ...root }
  base[head!] = applyPathValue(root?.[head!], rest, value)
  return base
}

function assignFinal(
  vm: any,
  target: { parent: any; last: string },
  value: unknown,
  remove: boolean | undefined,
  id: string,
): void {
  const { parent, last } = target
  const current = parent[last]

  if (checkIsRef(current)) {
    if (remove)
      throw new Error(
        `[updateComponentState] Cannot remove ref binding "${last}" on component "${id}"`,
      )
    const info = getSetupBindingInfo(current)
    if (info.computed) {
      const hasSetter =
        typeof (current as any)?.setter === 'function' ||
        typeof (current as any)?.set === 'function'
      if (!hasSetter || info.readonly) {
        throw new Error(
          `[updateComponentState] Cannot update readonly computed ref "${last}" on component "${id}"`,
        )
      }
    }
    current.value = value
    return
  }

  if (remove) {
    deleteReactive(vm, parent, last)
    return
  }

  setReactive(vm, parent, last, value)
}

export function updateComponentState(
  params: UpdateStateParams,
  onUpdated?: () => void,
): UpdateStateResult {
  const { id, section, remove } = params || {}
  const path =
    Array.isArray(params?.path) && params.path.length > 0
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
    throw new Error(
      `[updateComponentState] Component with id "${id}" not found in registry (may be unmounted)`,
    )
  }

  const internal = getInternal(vm)
  if (isInstanceDestroyed(vm)) {
    throw new Error(
      `[updateComponentState] Component with id "${id}" has been unmounted`,
    )
  }

  const key = path[0]!

  try {
    const setupState = resolveSetupSource(vm, internal)
    const data = getData(vm)
    const props = getProps(vm)
    const proxy = getProxy(vm)

    let updated = false

    if (section === 'props') {
      if (!props || !(key in props)) {
        throw new Error(
          `[updateComponentState] Key "${key}" not found in props on component "${id}"`,
        )
      }
      // mp 下 props 真源在宿主 properties，只写 Vue 侧到不了视图（见 setPropOnMpHost）
      if (!remove) {
        setPropOnMpHost(vm, props, path, value)
      }
      // Vue 侧同步落地，保证面板紧接着重拉时读到新值（observer 随后会以同值再写一次）
      assignFinal(vm, navigateToParent(props, path, id), value, remove, id)
      updated = true
    } else if (section === 'computed') {
      if (!proxy || !(key in proxy)) {
        throw new Error(
          `[updateComponentState] Key "${key}" not found in computed proxy on component "${id}"`,
        )
      }
      assignFinal(vm, navigateToParent(proxy, path, id), value, remove, id)
      updated = true
    } else {
      // section 显式给定走官方语义；缺省保持「setup 优先、data 兜底」探测
      const useSetup = section
        ? section === 'setup'
        : !!(setupState && key in setupState)
      const useData = section
        ? section === 'data'
        : !useSetup && !!(data && key in data)

      if (useSetup && setupState && key in setupState) {
        const isCapturedBindings =
          typeof internal?.render === 'function' &&
          internal.render[BINDINGS_PROP] === setupState
        const binding = setupState[key]

        if (path.length === 1) {
          const rawSetup = getRaw(setupState)
          const rawBinding = rawSetup?.[key]
          if (checkIsRef(rawBinding)) {
            if (remove)
              throw new Error(
                `[updateComponentState] Cannot remove ref binding "${key}" on component "${id}"`,
              )
            rawBinding.value = value
            updated = true
          } else if (checkIsRef(binding)) {
            if (remove)
              throw new Error(
                `[updateComponentState] Cannot remove ref binding "${key}" on component "${id}"`,
              )
            binding.value = value
            updated = true
          }
          // Object.assign 保持响应式代理引用，整体替换会丢响应式
          else if (typeof binding === 'object' && binding !== null) {
            if (remove) {
              delete setupState[key]
              updated = true
            } else if (typeof value === 'object' && value !== null) {
              Object.assign(binding, value)
              updated = true
            } else {
              throw new Error(
                `[updateComponentState] Cannot assign non-object value to reactive/object key "${key}" on component "${id}"`,
              )
            }
          }
          // (3) 纯值 / proxyRefs 代理穿透场景
          else {
            if (isCapturedBindings) {
              throw new Error(
                `[updateComponentState] Cannot edit plain-value binding "${key}" (mp 编译期内联的非响应式 const，仅 ref/reactive 绑定可编辑) on component "${id}"`,
              )
            }
            if (remove) {
              delete setupState[key]
            } else {
              setupState[key] = value
            }
            updated = true
          }
        } else {
          assignFinal(
            vm,
            navigateToParent(setupState, path, id),
            value,
            remove,
            id,
          )
          updated = true
        }
      }

      // Options API ($data)
      if (!updated && useData && data && key in data) {
        if (path.length === 1) {
          if (remove) {
            deleteReactive(vm, data, key)
          } else {
            setReactive(vm, data, key, value)
          }
          updated = true
        } else {
          assignFinal(vm, navigateToParent(data, path, id), value, remove, id)
          updated = true
        }
      }
    }

    if (!updated) {
      throw new Error(
        `[updateComponentState] Key "${key}" not found on component "${id}"`,
      )
    }

    // 响应式赋值不会自动驱动 mp 渲染，需显式触发（见 triggerComponentUpdate）
    triggerComponentUpdate(vm, internal)

    if (onUpdated) {
      onUpdated()
    }

    return { ok: true, key, value }
  } catch (err: any) {
    throw new Error(
      `[updateComponentState] Failed to update key "${key}" on component "${id}": ${err?.message || err}`,
    )
  }
}

// Vue 3.5 EffectFlags.DIRTY / EVALUATED
const COMPUTED_DIRTY_FLAG = 16
const COMPUTED_EVALUATED_FLAG = 128

/** 触发 computed ref 重算（镜像 kit triggerComputedRef） */
export function triggerComputedRef(computedRef: any): void {
  if (!computedRef || typeof computedRef !== 'object') return

  if (typeof computedRef.flags === 'number') {
    computedRef.flags =
      (computedRef.flags | COMPUTED_DIRTY_FLAG) & ~COMPUTED_EVALUATED_FLAG
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
    throw new Error(
      `[recomputeComponentState] Component with id "${id}" not found in registry (may be unmounted)`,
    )
  }

  if (section !== 'setup') {
    throw new Error(
      `[recomputeComponentState] Recompute is only supported for setup section (got "${section}")`,
    )
  }

  if (!Array.isArray(path) || path.length !== 1) {
    throw new Error(
      `[recomputeComponentState] Recompute requires path of length 1 (got ${JSON.stringify(path)})`,
    )
  }

  const key = path[0]!
  const internal = vm.$ || vm
  const setupState = resolveSetupSource(vm, internal)
  if (!setupState || !(key in setupState)) {
    throw new Error(
      `[recomputeComponentState] Binding "${key}" not found in setup for component "${id}"`,
    )
  }

  const rawSetup = getRaw(setupState)
  const rawBinding =
    rawSetup?.[key] !== undefined ? rawSetup[key] : setupState[key]
  const binding = setupState[key]
  const target = rawBinding !== undefined ? rawBinding : binding

  const info = getSetupBindingInfo(target)
  if (!info.computed) {
    throw new Error(
      `[recomputeComponentState] Binding "${key}" is not a computed ref on component "${id}"`,
    )
  }

  triggerComputedRef(target)
  triggerComponentUpdate(vm, internal)
  return { ok: true }
}
