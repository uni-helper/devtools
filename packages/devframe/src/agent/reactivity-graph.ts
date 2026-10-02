/**
 * Reactivity Graph 采集器（探针侧）
 * 沿 Vue 3.5+ 响应式双向链表（deps/nextDep、subs/nextSub，link 节点带 .dep/.sub）遍历，
 * 产出 ReactivityGraphSnapshot（{nodes, relationships}）。
 * 约束：纯 JSON 安全、禁浏览器 API、不引入任何 node/devtools-kit 运行时依赖。
 */

import type {
  ReactivityGraphNode,
  ReactivityGraphNodeType,
  ReactivityGraphSnapshot,
  ReactivityRelationship,
} from '../types.ts'
import { BINDINGS_PROP } from '../shared/contracts.ts'
import { getRaw, getSetupBindingInfo } from './serialize.ts'

/** 模块级对象 ID 映射，保证同一对象跨快照 id 稳定 */
const objectIdMap = new WeakMap<object, string>()
let nextId = 1

function getReactivityNodeId(reference: object): string {
  let id = objectIdMap.get(reference)
  if (!id) {
    id = `reactivity-${nextId++}`
    objectIdMap.set(reference, id)
  }
  return id
}

interface ReactivityDependency {
  type: ReactivityGraphNodeType
  reference: object
  data: Record<string, unknown>
}

interface ReactivitySource {
  key: string
  reference: object
  deps: ReactivityDependency[]
  subs: ReactivityDependency[]
}

export function buildReactivityGraph(
  setupSource: Record<string, unknown> | undefined | null,
): ReactivityGraphSnapshot {
  if (setupSource == null || typeof setupSource !== 'object') {
    return {
      nodes: [],
      relationships: [],
    }
  }

  try {
    const rawSetup = getRaw(setupSource)
    const sources: ReactivitySource[] = []
    const nodes = new Map<object, ReactivityGraphNode>()

    for (const key of Object.keys(setupSource)) {
      if (!key || key[0] === '$' || key[0] === '_')
        continue

      try {
        const rawBinding = rawSetup?.[key]
        const binding = setupSource[key]

        // 判定优先用 raw 侧（proxyRefs 会解包 ref 导致属性读取丢掉 ref 标识）
        const infoRaw = getSetupBindingInfo(rawBinding)
        const infoProp = getSetupBindingInfo(binding)
        const isRawReactive = infoRaw.ref || infoRaw.computed || infoRaw.reactive
        const info = isRawReactive ? infoRaw : infoProp

        const type = getReactivityStateType(info)
        if (!type)
          continue

        const rawObj = asTraceObject(rawBinding)
        const propObj = asTraceObject(binding)
        const reference = isRawReactive
          ? (rawObj ?? propObj)
          : (propObj ?? rawObj)

        if (!reference)
          continue

        const deps = collectReactivityDependencies(reference, 'deps')
        const subs = collectReactivityDependencies(reference, 'subs')
        const data: Record<string, unknown> = {
          key,
          readonly: info.readonly,
          value: formatReactivityValue(readReactivityValue(reference)),
        }

        upsertReactivityNode(nodes, reference, type, data)
        for (const dependency of deps) {
          upsertReactivityNode(nodes, dependency.reference, dependency.type, dependency.data)
        }
        for (const dependency of subs) {
          upsertReactivityNode(nodes, dependency.reference, dependency.type, dependency.data)
        }

        sources.push({
          key,
          reference,
          deps,
          subs,
        })
      }
      catch {
        // 单个绑定失败不影响其他绑定
        continue
      }
    }

    const relationships = new Map<string, ReactivityRelationship>()

    for (const source of sources) {
      const sourceNode = nodes.get(source.reference)
      if (!sourceNode)
        continue

      for (const sub of source.subs) {
        const subNode = nodes.get(sub.reference)
        if (subNode)
          upsertReactivityRelationship(relationships, sourceNode.id, subNode.id)
      }

      for (const dep of source.deps) {
        const depNode = nodes.get(dep.reference)
        if (depNode)
          upsertReactivityRelationship(relationships, depNode.id, sourceNode.id)
      }
    }

    return {
      nodes: [...nodes.values()],
      relationships: [...relationships.values()],
    }
  }
  catch {
    return {
      nodes: [],
      relationships: [],
    }
  }
}

function upsertReactivityNode(
  nodes: Map<object, ReactivityGraphNode>,
  reference: object,
  type: ReactivityGraphNodeType,
  data: Record<string, unknown>,
): void {
  const current = nodes.get(reference)
  const nextData = {
    ...current?.data,
    ...data,
  }

  const effectiveType = current?.type && current.type !== 'unknown'
    ? current.type
    : type

  nodes.set(reference, {
    id: current?.id ?? getReactivityNodeId(reference),
    type: effectiveType,
    label: normalizeReactivityNodeLabel(effectiveType, nextData),
    data: nextData,
  })
}

function upsertReactivityRelationship(
  relationships: Map<string, ReactivityRelationship>,
  from: string,
  to: string,
): void {
  if (from === to)
    return

  const id = `${from}->${to}`
  if (relationships.has(id))
    return

  relationships.set(id, {
    id,
    from,
    to,
  })
}

function collectReactivityDependencies(
  source: object,
  type: 'deps' | 'subs',
): ReactivityDependency[] {
  const dependencies: ReactivityDependency[] = []
  const itemKey = type === 'subs' ? 'sub' : 'dep'
  const nextKey = type === 'subs' ? 'nextSub' : 'nextDep'
  const head = type === 'subs' ? readSubscribersHead(source) : readDepsHead(source)
  const seen = new Set<object>()

  for (
    let link = head;
    link && typeof link === 'object' && !seen.has(link);
    link = asTraceObject(readUnknownProperty(link, nextKey))
  ) {
    seen.add(link)

    const reference = asTraceObject(readUnknownProperty(link, itemKey))
    if (!reference)
      continue

    const reactivityType = getReactivityType(reference)
    dependencies.push({
      type: reactivityType,
      reference,
      data: createReactivityDependencyData(reference, reactivityType),
    })
  }

  return dependencies
}

function createReactivityDependencyData(
  reference: object,
  type: ReactivityGraphNodeType,
): Record<string, unknown> {
  if (type === 'render') {
    return {
      instanceName: readComponentDisplayName(readObject(reference, 'instance')),
    }
  }

  if (type === 'watch') {
    return {
      cb: readFunctionPreview(readUnknownProperty(reference, 'cb')),
    }
  }

  const depKey = readUnknownProperty(reference, 'key')
  if (getConstructorName(reference) === 'Dep' || depKey !== undefined) {
    return {
      key: formatReactivityKey(depKey),
    }
  }

  return {
    value: formatReactivityValue(readReactivityValue(reference)),
  }
}

function normalizeReactivityNodeLabel(
  type: ReactivityGraphNodeType,
  data: Record<string, unknown>,
): string {
  if (typeof data.key === 'string' && data.key) {
    return type === 'reactive' && !data.key.startsWith('reactive.')
      ? `reactive.${data.key}`
      : data.key
  }

  if (type === 'render' && typeof data.instanceName === 'string') {
    return `${data.instanceName} render`
  }

  return fallbackReactivityNodeLabel(type)
}

function fallbackReactivityNodeLabel(type: ReactivityGraphNodeType): string {
  switch (type) {
    case 'ref':
      return 'Anonymous Ref'
    case 'computed':
      return 'Anonymous Computed'
    case 'reactive':
      return 'Reactive Property'
    case 'watch':
      return 'Anonymous Watch'
    case 'render':
      return 'Anonymous Render'
    case 'effect':
      return 'Anonymous Effect'
    default:
      return 'Unknown'
  }
}

function getReactivityStateType(
  info: ReturnType<typeof getSetupBindingInfo>,
): ReactivityGraphNodeType | undefined {
  if (info.computed)
    return 'computed'
  if (info.ref)
    return 'ref'
  if (info.reactive)
    return 'reactive'
  return undefined
}

function getReactivityType(reference: object): ReactivityGraphNodeType {
  const constructorName = getConstructorName(reference)

  // 官方 devtools-kit 3.6 构造器名
  if (constructorName === 'SetupRenderEffect')
    return 'render'
  if (constructorName === 'RenderWatcherEffect' || constructorName === 'WatcherEffect')
    return 'watch'
  if (constructorName === 'ReactiveEffect')
    return 'effect'
  if (constructorName === 'Dep')
    return 'reactive'

  // Vue 3.5 补充启发（按序尝试）
  if (constructorName === 'Watcher')
    return 'watch'
  const cb = readUnknownProperty(reference, 'cb')
  if (typeof cb === 'function')
    return 'watch'
  const fn = readUnknownProperty(reference, 'fn')
  if (typeof fn === 'function' && hasBindingsProp(fn))
    return 'render'

  const info = getSetupBindingInfo(reference)
  return getReactivityStateType(info) ?? 'unknown'
}

function hasBindingsProp(fn: unknown): boolean {
  try {
    return fn != null && (fn as any)[BINDINGS_PROP] !== undefined
  }
  catch {
    return false
  }
}

function getConstructorName(value: unknown): string {
  try {
    return asTraceObject(value)?.constructor?.name ?? ''
  }
  catch {
    return ''
  }
}

function readSubscribersHead(source: object): object | undefined {
  return (
    asTraceObject(readUnknownProperty(source, 'subs'))
    ?? asTraceObject(readUnknownProperty(source, '_subs'))
    ?? asTraceObject(readUnknownProperty(readObject(source, 'dep'), 'subs'))
  )
}

function readDepsHead(source: object): object | undefined {
  return (
    asTraceObject(readUnknownProperty(source, 'deps'))
    ?? asTraceObject(readUnknownProperty(source, '_deps'))
    ?? asTraceObject(readUnknownProperty(readObject(source, 'effect'), 'deps'))
  )
}

function asTraceObject(value: unknown): object | undefined {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
    ? (value as object)
    : undefined
}

function readUnknownProperty(target: unknown, key: string): unknown {
  try {
    return (target as any)?.[key]
  }
  catch {
    return undefined
  }
}

function readObject(target: object | undefined, key: string): object | undefined {
  if (!target)
    return undefined
  const val = readUnknownProperty(target, key)
  return typeof val === 'object' && val !== null ? val : undefined
}

function readStringProperty(target: object | undefined, key: string): string | undefined {
  if (!target)
    return undefined
  const val = readUnknownProperty(target, key)
  return typeof val === 'string' ? val : undefined
}

function hasOwn(target: object, key: PropertyKey): boolean {
  try {
    return Object.prototype.hasOwnProperty.call(target, key)
  }
  catch {
    return false
  }
}

function readReactivityValue(reference: object): unknown {
  try {
    if (hasOwn(reference, 'value')) {
      return (reference as any).value
    }
    if (hasOwn(reference, '_value')) {
      return (reference as any)._value
    }
    if ('value' in reference) {
      return (reference as any).value
    }
    if ('_value' in reference) {
      return (reference as any)._value
    }
    return undefined
  }
  catch {
    return undefined
  }
}

function readFunctionPreview(value: unknown): string | undefined {
  try {
    return typeof value === 'function' ? truncate(value.toString(), 220) : undefined
  }
  catch {
    return undefined
  }
}

function readComponentDisplayName(instance: object | undefined): string {
  if (!instance)
    return 'Anonymous component'
  try {
    const type = readObject(instance, 'type')
    const name
      = (type && readStringProperty(type, 'name'))
      ?? (type && readStringProperty(type, '__name'))
      ?? readStringProperty(instance, 'name')
    return name ?? 'Anonymous component'
  }
  catch {
    return 'Anonymous component'
  }
}

function formatReactivityKey(value: unknown): string {
  try {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
      return String(value)
    }
    if (typeof value === 'symbol') {
      return value.description ? `Symbol(${value.description})` : 'Symbol'
    }
    return 'property'
  }
  catch {
    return 'property'
  }
}

function formatReactivityValue(value: unknown): string {
  try {
    if (typeof value === 'undefined')
      return 'undefined'
    if (value == null)
      return String(value)
    if (typeof value === 'string')
      return `"${truncate(value, 80)}"`
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value)
    }
    if (typeof value === 'symbol') {
      return value.description ? `Symbol(${value.description})` : 'Symbol'
    }
    if (typeof value === 'function')
      return value.name ? `fn ${value.name}` : 'function'
    if (Array.isArray(value))
      return `Array(${value.length})`
    if (value instanceof Date)
      return value.toISOString()

    if (typeof value === 'object') {
      try {
        const keys = Reflect.ownKeys(value).slice(0, 3).map(formatReactivityKey)
        return `${value.constructor?.name ?? 'Object'}${keys.length ? ` { ${keys.join(', ')} }` : ''}`
      }
      catch {
        return 'Object'
      }
    }

    return Object.prototype.toString.call(value)
  }
  catch {
    return 'unknown'
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}
