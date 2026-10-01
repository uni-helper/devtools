/**
 * uni-devtools 适配器：把官方 Vue Devtools client 消费的 kit RPC 协议
 * （query / command / runtime events，契约见 vendored
 * `@vue/devtools-kit` 的 `src/protocol/requests.ts`）映射到我们的
 * devframe RPC（scope `uni-helper-devtools`）与探针数据上。
 *
 * 这是「方案 A」唯一的桥：官方 UI 与 `useDevtoolsClient` 一行不改，
 * `devtools-connection.ts` 只把 `connectDevtoolsClient()` 换成本文件的
 * `connectUniRpcClient()`。
 *
 * 映射总纲（与批次 B-panel-0930 的探索测绘一致）：
 * - uni-app 的每个页面 = 一个 AppSnapshot（多 app 下拉直接复用官方 UI）；
 *   组件 id 由探针命名为 `route#uid`，appId 恒可由 `id.split('#')[0]` 得到
 * - 探针嵌套树 → 扁平 ComponentTreeNodeSnapshot[]（官方树无 children 字段）；
 *   treeSnapshot 按 request.appId 过滤（官方 client 按选中 app 存整棵树，
 *   不隔离会串页）；treePatched 事件**必须带 appId** 且与选中 app 一致，
 *   否则官方在 devtools-client 的事件入口直接静默丢弃
 * - 探针 {data,setup} → sections（扁平 StateEntry[]，path[0]=sectionId）
 * - 编辑仅顶层键（探针上限），更深的 path 如实报错，不假装成功；
 *   stateInvalidated 的 version 按**组件**计数（官方防陈旧循环以组件为维度
 *   比较 version，全局计数器会在并发编辑时把旧快照盖上新版本号）
 * - 树更新：sharedState 推送 → 按 appId 分组的「全删 + 全插」重建 patch 集
 *
 * 生命周期：全部状态收在 `connectUniRpcClient()` 工厂闭包内——官方连接层
 * 会在健康检查失败/stop 时 dispose 旧 client 并择机新建，模块级单例会让
 * 第二个实例永久瘫痪（CR P0-2）。
 */
import type { DevtoolsRpcClient, DevtoolsRpcEventHandler } from '@vue/devtools-kit/client'
import type {
  AppSnapshot,
  ComponentStateSnapshotMessage,
  ComponentTreeNodeSnapshot,
  ComponentTreePatch,
  DevtoolsRpcEvent,
  EncodedValue,
  StateEntry,
} from '@vue/devtools-kit'
import type {
  ComponentStateResult,
  ComponentTreeResult,
} from '@uni-helper/devtools-devframe/types'
import { encodeValue } from '@vue/devtools-kit'
import { connectDevframe } from 'devframe/client'
import { mockComponentState, mockComponentTree, mockUpdateComponentState } from './fixtures'

/** 与 node 侧 `ctx.scope(NS)` 一致；改这里必须同步改 node 侧。 */
const NAMESPACE = 'uni-helper-devtools'

/** 显式 mock 模式（URL `?mock`）：无后端开发/回归用，界面常驻提示。 */
export const mockMode = new URLSearchParams(window.location.search).has('mock')

type ConnectionStatus = 'connecting' | 'connected' | 'closed'
type QueryRequest = { type: string, appId?: string, payload?: any }
type CommandRequest = { type: string, appId?: string, payload?: any }
// 注意：kit 的 RuntimeCommandResult 语义为 status 1=成功、0=失败
// （vendored kit `runtime/runtime.ts` 的 `?? { status: 1 }` 与错误路径 `{ status: 0, error }`）。
type CommandResult = { status: 0 | 1, error?: unknown }

/** sharedState `component-tree` 的订阅面（devframe scoped client 的一部分）。 */
interface SharedStateLike<T> {
  on: (event: 'updated', cb: (state: T) => void) => () => void
}

interface ScopedCtx {
  rpc: {
    call: (method: string, ...args: unknown[]) => Promise<unknown>
    /** 正确入口是 scoped.rpc.sharedState(key, options)，与 node 侧对称；
     *  scope 对象本身没有 sharedState 属性（曾想当然写成 sharedState.get）。 */
    sharedState: <T extends object>(key: string, options?: { initialValue?: T }) => Promise<SharedStateLike<T>>
  }
}

interface FlatTree {
  apps: AppSnapshot[]
  nodes: ComponentTreeNodeSnapshot[]
}

/** 哨兵引用：连接断开后重置回来，让下一次 treeSnapshot 主动重拉而不是吐陈旧树。 */
const EMPTY_TREE: FlatTree = { apps: [], nodes: [] }

/** 组件 id → appId。探针 id 形如 `route#uid`，mock fixtures 同格式。 */
function appIdOf(id: string): string | undefined {
  const idx = id.indexOf('#')
  return idx > 0 ? id.slice(0, idx) : undefined
}

const NOT_SUPPORTED = (what: string): string => `uni-devtools 探针暂不支持：${what}`

/** standalone 直连时 token 附在面板 URL 上（避坑清单 §8-2）；hub iframe 场景为空。 */
function readAuthTokenFromUrl(): string | undefined {
  return new URLSearchParams(window.location.search).get('devframe_auth_token') ?? undefined
}

/** 探针嵌套树 → 官方扁平快照。page 即 app；`updatedAt` 必填取 fetchedAt。 */
function buildFlatTree(tree: ComponentTreeResult): FlatTree {
  const apps: AppSnapshot[] = []
  const nodes: ComponentTreeNodeSnapshot[] = []
  for (const page of tree.pages ?? []) {
    const appId = page.route
    let count = 0
    const walk = (node: { id: string, name: string, file?: string, children?: Array<{ id: string, name: string, file?: string, children?: unknown[] }> }, parentId?: string): void => {
      nodes.push({
        id: node.id,
        appId,
        parentId,
        name: node.name,
        file: node.file,
        updatedAt: tree.fetchedAt,
        childCount: node.children?.length,
        tags: parentId === undefined ? [{ label: 'page' }] : undefined,
      })
      count++
      for (const child of node.children ?? [])
        walk(child as typeof node, node.id)
    }
    if (page.components)
      walk(page.components)
    apps.push({ id: appId, name: page.route, componentCount: count })
  }
  return { apps, nodes }
}

function sameAppSet(a: AppSnapshot[], b: AppSnapshot[]): boolean {
  if (a.length !== b.length)
    return false
  const ids = new Set(a.map(app => app.id))
  return b.every(app => ids.has(app.id))
}

function toStateEntry(sectionId: string, key: string, value: unknown, stateType?: string): StateEntry {
  return {
    key,
    path: [sectionId, key],
    // 高 maxDepth 让探针已物化的 JSON（depth 6）几乎全量可展开；不给 handle，
    // 更深处呈现为截断预览——探针没有 values:expand 通道，不假装可展开。
    value: encodeValue(value, { maxDepth: 8, maxEntries: 100 }) as EncodedValue,
    editable: true,
    ...(stateType ? { meta: { stateType } } : {}),
  }
}

function toStateSnapshot(result: ComponentStateResult, version: number): ComponentStateSnapshotMessage {
  const sections: ComponentStateSnapshotMessage['sections'] = []
  const setupEntries = Object.entries(result.setup ?? {}).map(
    ([key, field]) => toStateEntry('setup', key, field.value, field.type),
  )
  if (setupEntries.length > 0)
    sections.push({ id: 'setup', label: 'Setup', entries: setupEntries })
  const dataEntries = Object.entries(result.data ?? {}).map(
    ([key, value]) => toStateEntry('data', key, value),
  )
  if (dataEntries.length > 0)
    sections.push({ id: 'data', label: 'Data', entries: dataEntries })
  return { componentId: result.id, version, sections }
}

/** 与 kit 的 `connectDevtoolsClient()` 同签名的同步工厂（连接在内部异步建立）。 */
export function connectUniRpcClient(): DevtoolsRpcClient {
  // ---- 实例状态（闭包内；官方连接层会 dispose 旧实例再建新的） ----
  const eventHandlers = new Set<DevtoolsRpcEventHandler>()
  const connectionHandlers = new Set<(status: ConnectionStatus) => void>()
  /** 按组件计数的 state version（官方防陈旧循环以组件为维度比较）。 */
  const stateVersionByComponent = new Map<string, number>()

  let flat: FlatTree = EMPTY_TREE
  let treeVersion = 0
  let scoped: ScopedCtx | undefined
  let client: Awaited<ReturnType<typeof connectDevframe>> | undefined
  let ready: Promise<void> | undefined
  let unsubSharedState: (() => void) | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  function emit(event: Omit<DevtoolsRpcEvent, 'time'> & { type: DevtoolsRpcEvent['type'] }): void {
    const envelope = { time: Date.now(), ...event } as DevtoolsRpcEvent
    for (const handler of eventHandlers)
      handler(envelope)
  }

  function emitConnection(status: ConnectionStatus): void {
    for (const handler of connectionHandlers)
      handler(status)
  }

  /**
   * 树快照更新 → 按 appId 分组的重建 patch 集 + 事件。
   *
   * 官方 client 对 `components:treePatched` 有两道硬校验：事件必须带 appId、
   * 且等于当前选中 app（devtools-client.ts 的 attachRuntimeEvents），漏了
   * appId 会被静默丢弃——所以必须逐 app 派发，不能一发全量。同 app 的
   * remove-then-insert 依赖 DFS 序（父先于子），`orderComponentTree` 兜底。
   */
  function applyTreeSnapshot(tree: ComponentTreeResult): void {
    const next = buildFlatTree(tree)
    const appsChanged = !sameAppSet(flat.apps, next.apps)
    if (!appsChanged) {
      const patchesByApp = new Map<string, ComponentTreePatch[]>()
      const push = (appId: string, patch: ComponentTreePatch): void => {
        const list = patchesByApp.get(appId)
        if (list)
          list.push(patch)
        else
          patchesByApp.set(appId, [patch])
      }
      for (const node of flat.nodes)
        push(node.appId, { op: 'remove', id: node.id })
      for (const node of next.nodes)
        push(node.appId, { op: 'insert', parentId: node.parentId, node })
      for (const [appId, patches] of patchesByApp)
        emit({ type: 'components:treePatched', appId, version: ++treeVersion, patches })
    }
    else {
      // apps 集合变化（页面增删）走官方全量刷新路径，AppList 与计数随之更新。
      emit({ type: 'apps:changed' })
    }
    flat = next
  }

  /** 首次（尚无 sharedState 推送）主动拉一次树，之后 sharedState 是唯一数据源。 */
  async function pullTreeOnce(): Promise<void> {
    if (flat !== EMPTY_TREE)
      return
    const tree = mockMode
      ? mockComponentTree()
      : await callUni<ComponentTreeResult>('get-component-tree')
    applyTreeSnapshot(tree)
  }

  async function callUni<T>(method: string, ...args: unknown[]): Promise<T> {
    if (!scoped)
      throw new Error('uni-devtools RPC 尚未连接')
    return await scoped.rpc.call(method, ...args) as T
  }

  function resetConnectionState(): void {
    scoped = undefined
    unsubSharedState?.()
    unsubSharedState = undefined
    // 关键：重连后的首个 treeSnapshot 必须重拉，否则引用守卫失效、
    // 面板会一直展示断开前的陈旧树（CR P1-7）。
    flat = EMPTY_TREE
  }

  async function initConnection(): Promise<void> {
    if (mockMode) {
      applyTreeSnapshot(mockComponentTree())
      emitConnection('connected')
      return
    }
    emitConnection('connecting')
    try {
      const connected = await connectDevframe({
        authToken: readAuthTokenFromUrl(),
        simpleAuth: false,
      })
      if (disposed) {
        connected.close?.()
        return
      }
      client = connected
      scoped = client.scope(NAMESPACE) as unknown as ScopedCtx
      // 注意：这里不提前上报 connected——connectDevframe resolve 时连接多半仍处于
      // connecting，提前谎报会让官方层的 hasEverConnected 提前置位，等真实
      // connected 事件再来时就走「重连」分支（onRuntimeChanged + 全量刷新），
      // 双刷新的竞态最终把刚建立的连接拆掉。connected 只由下方真实事件上报。
      client.events.on('connection:status', (status) => {
        if (status === 'connected') {
          emitConnection('connected')
        }
        else if (status === 'connecting') {
          emitConnection('connecting')
        }
        else {
          // devframe 客户端断开即作废（无内建重连）：清态、内部重连、成功后由
          // connection 层的 runtime-changed 语义触发全量刷新。
          resetConnectionState()
          emitConnection('closed')
          scheduleReconnect()
        }
      })
      try {
        const shared = await scoped.rpc.sharedState<ComponentTreeResult>('component-tree', {
          initialValue: { fetchedAt: 0, pages: [] },
        })
        if (disposed)
          return
        unsubSharedState = shared.on('updated', (snapshot) => {
          if (snapshot && Array.isArray(snapshot.pages))
            applyTreeSnapshot(snapshot)
        })
      }
      catch (error) {
        // 订阅失败不致命：连接仍在，树走 get-component-tree 主动拉取路径。
        console.warn('[uni-devtools] sharedState 订阅失败，树更新退化为手动/首拉模式:', error)
      }
    }
    catch (error) {
      resetConnectionState()
      emitConnection('closed')
      scheduleReconnect()
      throw new Error(`无法连接 devframe 服务端（Uni DevTools 插件未启动？）：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function scheduleReconnect(): void {
    if (disposed || reconnectTimer)
      return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      ready = initConnection().catch(() => {})
    }, 1500)
  }

  function ensureReady(): Promise<void> {
    if (disposed)
      return Promise.reject(new Error('adapter disposed'))
    ready ??= initConnection()
    return ready
  }

  async function handleQuery(request: QueryRequest): Promise<unknown> {
    switch (request.type) {
      case 'apps:snapshot': {
        await ensureReady()
        await pullTreeOnce().catch(() => {})
        return { apps: flat.apps }
      }

      case 'devtools:capabilities':
        // openInEditor：真实模式支持，mock 模式无后端保持 false；分页树未实现。
        return { openInEditor: !mockMode, pagedComponentTree: false }

      case 'runtime:health':
        return { status: 'ready', performance: {
          receivedEvents: 0, emittedEvents: 0, droppedEvents: 0, coalescedEvents: 0,
          bufferedEvents: 0, bufferedBytes: 0, collectionActive: false, attachedClients: 1,
        } }

      case 'plugins:snapshot':
        return { plugins: [] }

      case 'inspectors:list':
        return { inspectors: [] }

      case 'components:treeSnapshot': {
        await ensureReady()
        await pullTreeOnce()
        // 官方 client 按选中 app 存整棵树：必须按 appId 过滤，否则多页面
        // 串页合并、切换 app 无感（CR P0-3）。
        const nodes = request.appId
          ? flat.nodes.filter(node => node.appId === request.appId)
          : flat.nodes
        return { version: treeVersion, nodes }
      }

      case 'components:stateSnapshot': {
        await ensureReady()
        const { componentId } = request.payload as { componentId: string }
        const state = mockMode
          ? mockComponentState(componentId)
          : await callUni<ComponentStateResult>('get-component-state', { id: componentId })
        return toStateSnapshot(state, stateVersionByComponent.get(componentId) ?? 0)
      }

      case 'router:snapshot':
        // 用树快照的页面路由伪造 routes，overview 的页面计数因此有意义。
        return { routes: flat.apps.map(app => ({ path: `/${app.id}`, name: app.id })) }

      case 'components:inspect':
      case 'components:getRenderCode':
      case 'components:getBounds':
      case 'components:getName':
      case 'values:expand':
      case 'values:storeAsGlobal':
      case 'inspectors:info':
        return undefined

      default:
        return undefined
    }
  }

  async function handleCommand(request: CommandRequest): Promise<CommandResult> {
    switch (request.type) {
      case 'components:editState': {
        await ensureReady()
        const payload = request.payload as {
          componentId: string, sectionId?: string, path?: string[], value?: unknown, remove?: boolean
        }
        if (payload.remove)
          return { status: 0, error: NOT_SUPPORTED('删除状态键') }
        const path = payload.path ?? []
        if (path.length !== 1)
          return { status: 0, error: NOT_SUPPORTED(`嵌套路径编辑（${payload.sectionId}.${path.join('.')}）；当前仅支持顶层键`) }
        if (mockMode)
          mockUpdateComponentState({ id: payload.componentId, key: path[0]!, value: payload.value })
        else
          await callUni('update-component-state', { id: payload.componentId, key: path[0], value: payload.value })
        // 官方刷新语义：带递增 version 的失效事件 → 检查器重拉（防陈旧覆盖）。
        // version 按组件计数；appId 必填（事件入口按 appId+componentId 双重校验）。
        const componentId = payload.componentId
        const version = (stateVersionByComponent.get(componentId) ?? 0) + 1
        stateVersionByComponent.set(componentId, version)
        emit({
          type: 'components:stateInvalidated',
          appId: appIdOf(componentId),
          componentId,
          version,
          reason: 'edit',
        })
        return { status: 1 }
      }

      case 'components:addState':
        return { status: 0, error: NOT_SUPPORTED('新增状态键') }

      case 'components:openInEditor': {
        if (mockMode)
          return { status: 0, error: NOT_SUPPORTED('mock 模式不支持在编辑器中打开') }
        await ensureReady()
        const payload = request.payload as { file?: string }
        if (!payload?.file)
          return { status: 0, error: '缺少文件路径' }
        try {
          await callUni('open-in-editor', { file: payload.file })
          return { status: 1 }
        }
        catch (error) {
          return { status: 0, error: error instanceof Error ? error.message : String(error) }
        }
      }

      case 'values:recompute':
      case 'values:customAction':
        return { status: 0, error: NOT_SUPPORTED('computed 重算 / 自定义值动作') }

      default:
        // highlight / scrollTo / inspectDom / expandTreeNode / timeline:* / inspectors:* 等
        // 探针没有对应能力的命令一律静默成功，保持 UI 交互不炸。
        return { status: 1 }
    }
  }

  if (!mockMode)
    void ensureReady().catch(() => {})

  const query = async (request: QueryRequest) => handleQuery(request)
  const command = async (request: CommandRequest) => handleCommand(request)

  return {
    query,
    command,
    queryCustom: query,
    commandCustom: command,
    onEvent(handler) {
      eventHandlers.add(handler)
      return () => {
        eventHandlers.delete(handler)
      }
    },
    onConnectionChanged(handler) {
      connectionHandlers.add(handler)
      return () => {
        connectionHandlers.delete(handler)
      }
    },
    dispose() {
      disposed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }
      unsubSharedState?.()
      unsubSharedState = undefined
      resetConnectionState()
      client?.close?.()
      client = undefined
      eventHandlers.clear()
      connectionHandlers.clear()
    },
  } as DevtoolsRpcClient
}
