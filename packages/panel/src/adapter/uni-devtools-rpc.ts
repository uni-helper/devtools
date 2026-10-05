/**
 * uni-devtools 适配器：把官方 Vue Devtools client 消费的 kit RPC 协议
 * （query / command / runtime events，契约见 npm 版 `@vue/devtools-kit` 的
 * `protocol/requests.ts`）映射到我们的 devframe RPC（scope `uni-helper-devtools`）
 * 与探针数据上。
 *
 * 注入点：官方 UI 与 `useDevtoolsClient` 一行不改，`devtools-connection.ts`
 * 把官方的 `connectDevtoolsClient()`（host 发现）换成本文件的 `connectUniRpcClient()`。
 *
 * 数据结构 → kit 协议形状的映射在 `./mapping`（可观测行为由 test/mapping 冻结）；
 * 本文件只管 RPC 路由、连接生命周期与 mock 分支。kit 的反直觉约束（事件必须带
 * appId、失效事件名 ≠ command 名、version 按组件计数等）就地注释在各分支旁。
 *
 * 生命周期：全部状态收在 `connectUniRpcClient()` 工厂闭包内——官方连接层会在
 * 健康检查失败/stop 时 dispose 旧 client 并择机新建，模块级单例会让第二个
 * 实例永久瘫痪。
 */
import type { DevtoolsRpcClient, DevtoolsRpcEventHandler } from '@vue/devtools-kit/client'
import type {
  DevtoolsRpcEvent,
  RouterRouteRecordSnapshot,
  RouterRouteSnapshot,
  RouterSnapshotMessage,
} from '@vue/devtools-kit'
import type {
  ComponentStateResult,
  ComponentTreeResult,
  GetComponentRenderCodeResult,
  GetPiniaStoresResult,
  GetRegisteredRoutesResult,
  PiniaStateResult,
  RouterInfoResult,
} from '@uni-helper/devtools-devframe/types'
import { connectDevframe } from 'devframe/client'
import type { FlatTree } from './mapping'
import {
  appIdOf,
  buildFlatTree,
  computeTreeDiff,
  mergeRecordsById,
  PINIA_ROOT_ID,
  PINIA_ROOT_LABEL,
  toPiniaRootSnapshot,
  toPiniaStateSnapshot,
  toStateSnapshot,
} from './mapping'
import type {
  ClearNetworkRecordsResult,
  GetNetworkRecordsResult,
  NetworkRecord,
  NetworkSharedState,
  UniNetworkApi,
} from '../types/network'
import {
  mockClearNetworkRecords,
  mockComponentState,
  mockComponentTree,
  mockGetComponentRenderCode,
  mockNetworkRecords,
  mockPiniaState,
  mockPiniaStores,
  mockTickNetworkRecords,
  mockUpdateComponentState,
  mockUpdatePiniaState,
} from './fixtures'

let activeUniNetwork: UniNetworkApi | undefined

export function getUniNetworkApi(): UniNetworkApi | undefined {
  return activeUniNetwork
}

/** 与 node 侧 `ctx.scope(NS)` 一致；改这里必须同步改 node 侧。 */
const NAMESPACE = 'uni-helper-devtools'

export const mockMode = new URLSearchParams(window.location.search).has('mock')

type ConnectionStatus = 'connecting' | 'connected' | 'closed'
type QueryRequest = { type: string, appId?: string, payload?: any }
type CommandRequest = { type: string, appId?: string, payload?: any }
// 注意：kit 的 RuntimeCommandResult 语义为 status 1=成功、0=失败
// （vendored kit `runtime/runtime.ts` 的 `?? { status: 1 }` 与错误路径 `{ status: 0, error }`）。
type CommandResult = { status: 0 | 1, error?: unknown }

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

/** 哨兵引用：连接断开后重置回来，让下一次 treeSnapshot 主动重拉而不是吐陈旧树。 */
const EMPTY_TREE: FlatTree = { apps: [], nodes: [] }

function mockRouterSnapshot(): RouterSnapshotMessage {
  return {
    currentRoute: {
      path: '/pages/index/index',
      fullPath: '/pages/index/index',
      name: 'pages/index/index',
    },
    routes: [
      {
        path: '/pages/index/index',
        name: 'pages/index/index',
        meta: { title: '首页', type: 'home' },
      },
      {
        path: '/pages/settings/settings',
        name: 'pages/settings/settings',
        meta: { title: '设置', type: 'page' },
      },
    ],
  }
}

const NOT_SUPPORTED = (what: string): string => `uni-devtools 探针暂不支持：${what}`

/** standalone 直连时 token 附在面板 URL 上；hub iframe 场景为空。 */
function readAuthTokenFromUrl(): string | undefined {
  return new URLSearchParams(window.location.search).get('devframe_auth_token') ?? undefined
}

/** 与 kit 的 `connectDevtoolsClient()` 同签名的同步工厂（连接在内部异步建立）。 */
export function connectUniRpcClient(): DevtoolsRpcClient {
  // ---- 实例状态（闭包内；原因见文件头生命周期说明） ----
  const eventHandlers = new Set<DevtoolsRpcEventHandler>()
  const connectionHandlers = new Set<(status: ConnectionStatus) => void>()
  /** 按组件计数的 state version（官方防陈旧循环以组件为维度比较）。 */
  const stateVersionByComponent = new Map<string, number>()
  /** Pinia inspector 按 store nodeId 计数的 state version（同上防陈旧语义）。 */
  const inspectorVersionByNode = new Map<string, number>()

  let flat: FlatTree = EMPTY_TREE
  let treeVersion = 0
  let scoped: ScopedCtx | undefined
  let client: Awaited<ReturnType<typeof connectDevframe>> | undefined
  let ready: Promise<void> | undefined
  let unsubSharedState: (() => void) | undefined
  let unsubNetworkSharedState: (() => void) | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  // mock 模式心跳：驱动在途演示记录超时结算（真实模式数据来自探针推送，无此需要）
  let mockTickTimer: ReturnType<typeof setInterval> | undefined
  let disposed = false

  let cachedNetworkRecords: NetworkRecord[] = []
  const networkListeners = new Set<(records: NetworkRecord[]) => void>()

  function notifyNetwork(): void {
    const snapshot = [...cachedNetworkRecords]
    for (const handler of networkListeners) {
      try {
        handler(snapshot)
      }
      catch (error) {
        console.error('[uni-devtools] network listener error:', error)
      }
    }
  }

  function applyNetworkRecords(incoming: NetworkRecord[]): void {
    if (incoming.length === 0) {
      cachedNetworkRecords = []
      notifyNetwork()
      return
    }
    cachedNetworkRecords = mergeRecordsById(cachedNetworkRecords, incoming, 500)
    notifyNetwork()
  }

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
    const diff = computeTreeDiff(flat, next)
    if (diff.kind === 'apps-changed') {
      emit({ type: 'apps:changed' })
    }
    else {
      for (const [appId, patches] of diff.patchesByApp)
        emit({ type: 'components:treePatched', appId, version: ++treeVersion, patches })
    }
    flat = next
  }

  /** 首次（尚无 sharedState 推送）主动拉一次树，之后 sharedState 是唯一数据源。若已推快照但缺版本号，主动重拉一次补齐。 */
  async function pullTreeOnce(): Promise<void> {
    if (flat !== EMPTY_TREE && flat.apps.some(app => !!app.version))
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

  async function pullNetworkOnce(): Promise<void> {
    if (mockMode) {
      applyNetworkRecords(mockNetworkRecords())
      return
    }
    try {
      const res = await callUni<GetNetworkRecordsResult>('get-network-records')
      if (res && Array.isArray(res.records))
        applyNetworkRecords(res.records)
    }
    catch (error) {
      console.warn('[uni-devtools] get-network-records 拉取失败:', error)
    }
  }

  const uniNetwork: UniNetworkApi = {
    getRecords(): NetworkRecord[] {
      return [...cachedNetworkRecords]
    },
    async clear(): Promise<void> {
      if (mockMode) {
        mockClearNetworkRecords()
        cachedNetworkRecords = []
        notifyNetwork()
        return
      }
      await callUni<ClearNetworkRecordsResult>('clear-network-records')
      cachedNetworkRecords = []
      notifyNetwork()
    },
    subscribe(cb: (records: NetworkRecord[]) => void): () => void {
      networkListeners.add(cb)
      try {
        cb([...cachedNetworkRecords])
      }
      catch (err) {
        console.error('[uni-devtools] network listener initial error:', err)
      }
      return () => {
        networkListeners.delete(cb)
      }
    },
  }
  activeUniNetwork = uniNetwork

  function resetConnectionState(): void {
    scoped = undefined
    unsubSharedState?.()
    unsubSharedState = undefined
    unsubNetworkSharedState?.()
    unsubNetworkSharedState = undefined
    if (mockTickTimer) {
      clearInterval(mockTickTimer)
      mockTickTimer = undefined
    }
    // 关键：重连后的首个 treeSnapshot 必须重拉，否则引用守卫失效、
    // 面板会一直展示断开前的陈旧树。
    flat = EMPTY_TREE
    cachedNetworkRecords = []
    notifyNetwork()
  }

  async function initConnection(): Promise<void> {
    if (mockMode) {
      applyTreeSnapshot(mockComponentTree())
      applyNetworkRecords(mockNetworkRecords())
      emitConnection('connected')
      mockTickTimer = setInterval(() => {
        applyNetworkRecords(mockTickNetworkRecords())
      }, 1000)
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
      try {
        const networkShared = await scoped.rpc.sharedState<NetworkSharedState>('network-records', {
          initialValue: { records: [], latestId: 0, updatedAt: 0 },
        })
        if (disposed)
          return
        unsubNetworkSharedState = networkShared.on('updated', (snapshot) => {
          if (snapshot && Array.isArray(snapshot.records))
            applyNetworkRecords(snapshot.records)
        })
        await pullNetworkOnce().catch(() => {})
      }
      catch (error) {
        // 订阅失败不致命：连接仍在，网络记录走 get-network-records 主动拉取路径。
        console.warn('[uni-devtools] network sharedState 订阅失败，网络记录退化为主动拉取模式:', error)
        await pullNetworkOnce().catch(() => {})
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

      case 'devtools:capabilities': {
        // openInEditor：真实模式支持，mock 模式无后端保持 false；分页树未实现。
        // inspect：真实模式调 node 侧 get-inspect-status；mock 模式为 false（mock 无后端，tab 隐藏是预期行为）。
        let inspect = false
        if (!mockMode) {
          await ensureReady()
          inspect = !!(await callUni<{ available: boolean }>('get-inspect-status').catch(() => ({ available: false })))?.available
        }
        return {
          openInEditor: !mockMode,
          pagedComponentTree: false,
          inspect,
        }
      }

      case 'runtime:health':
        return { status: 'ready', performance: {
          receivedEvents: 0, emittedEvents: 0, droppedEvents: 0, coalescedEvents: 0,
          bufferedEvents: 0, bufferedBytes: 0, collectionActive: false, attachedClients: 1,
        } }

      case 'plugins:snapshot':
        return { plugins: [] }

      case 'inspectors:list':
        // Pinia 走官方 custom inspector 协议（官方 tabs.ts 对 id==='pinia' 有
        // 内建 tab 映射，无需改 tab 常量）
        return {
          inspectors: [{
            id: 'pinia',
            label: 'Pinia',
            stateFilterPlaceholder: 'Filter state...',
            treeFilterPlaceholder: 'Filter stores...',
            noSelectionText: 'Select a store in the tree to inspect it',
          }],
        }

      case 'inspectors:treeSnapshot': {
        await ensureReady()
        const { inspectorId, filter } = (request.payload ?? {}) as { inspectorId?: string, filter?: string }
        if (inspectorId !== 'pinia')
          return { inspectorId: inspectorId ?? '', rootNodes: [] }
        const res = mockMode
          ? mockPiniaStores()
          : await callUni<GetPiniaStoresResult>('get-pinia-stores')
        // 官方 pinia 插件语义：「🍍 Pinia (root)」与各 store 平级（stores =
        // [pinia, ..._s.values()]，非父子嵌套）；store 节点无标签；过滤同时匹配
        // 根标签与 store id
        const matches = (text: string): boolean => !filter || text.toLowerCase().includes(filter.toLowerCase())
        const rootNodes: Array<{ id: string, label: string }> = []
        if (matches(PINIA_ROOT_LABEL))
          rootNodes.push({ id: PINIA_ROOT_ID, label: PINIA_ROOT_LABEL })
        for (const store of res?.stores ?? []) {
          if (matches(store.id))
            rootNodes.push({ id: `store:${store.id}`, label: store.id })
        }
        return { inspectorId, rootNodes }
      }

      case 'inspectors:stateSnapshot': {
        await ensureReady()
        const { inspectorId, nodeId } = (request.payload ?? {}) as { inspectorId?: string, nodeId?: string }
        if (inspectorId !== 'pinia')
          return undefined
        // 聚合根：逐 store 拉取后按官方 _root 语义组装
        if (nodeId === PINIA_ROOT_ID) {
          const res = mockMode
            ? mockPiniaStores()
            : await callUni<GetPiniaStoresResult>('get-pinia-stores')
          const states: PiniaStateResult[] = []
          for (const store of res?.stores ?? []) {
            states.push(
              mockMode
                ? mockPiniaState(store.id)
                : await callUni<PiniaStateResult>('get-pinia-state', { id: store.id }),
            )
          }
          return toPiniaRootSnapshot(states, inspectorVersionByNode.get(nodeId) ?? 0)
        }
        if (!nodeId?.startsWith('store:'))
          return undefined
        const storeId = nodeId.slice('store:'.length)
        const state = mockMode
          ? mockPiniaState(storeId)
          : await callUni<PiniaStateResult>('get-pinia-state', { id: storeId })
        return toPiniaStateSnapshot(state, inspectorVersionByNode.get(nodeId) ?? 0)
      }

      case 'components:treeSnapshot': {
        await ensureReady()
        await pullTreeOnce()
        // 官方 client 按选中 app 存整棵树：必须按 appId 过滤，否则多页面
        // 串页合并、切换 app 无感。
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

      case 'router:snapshot': {
        if (mockMode)
          return mockRouterSnapshot()
        await ensureReady()
        let registeredRoutes: RouterRouteRecordSnapshot[] = []
        try {
          const res = await callUni<GetRegisteredRoutesResult>('get-registered-routes')
          if (Array.isArray(res?.routes) && res.routes.length > 0) {
            registeredRoutes = res.routes.map(r => ({
              path: r.path,
              name: r.name,
              meta: r.meta,
            }))
          }
        }
        catch {}

        if (registeredRoutes.length === 0) {
          registeredRoutes = flat.apps.map(app => ({ path: `/${app.id}`, name: app.id }))
        }

        let routerInfo: RouterInfoResult | undefined
        try {
          routerInfo = await callUni<RouterInfoResult>('get-router-info')
        }
        catch {}

        let currentRoute: RouterRouteSnapshot | undefined
        if (routerInfo?.currentRoute) {
          currentRoute = {
            path: routerInfo.currentRoute.path,
            fullPath: routerInfo.currentRoute.fullPath || routerInfo.currentRoute.path,
            query: routerInfo.currentRoute.query,
            name: routerInfo.currentRoute.path.replace(/^\//, ''),
          }
        }
        else if (request.appId) {
          currentRoute = {
            path: `/${request.appId}`,
            fullPath: `/${request.appId}`,
            name: request.appId,
          }
        }
        else if (registeredRoutes[0]) {
          currentRoute = {
            path: registeredRoutes[0].path,
            fullPath: registeredRoutes[0].path,
            name: registeredRoutes[0].name,
          }
        }

        return {
          appId: request.appId,
          currentRoute,
          routes: registeredRoutes,
        }
      }

      case 'router:matchedRoutes': {
        const payload = request.payload as { path?: string }
        const inputPath = payload?.path || ''
        let allRoutes: RouterRouteRecordSnapshot[] = []
        if (mockMode) {
          allRoutes = mockRouterSnapshot().routes
        }
        else {
          try {
            const res = await callUni<GetRegisteredRoutesResult>('get-registered-routes')
            if (Array.isArray(res?.routes) && res.routes.length > 0)
              allRoutes = res.routes
          }
          catch {}
          if (allRoutes.length === 0)
            allRoutes = flat.apps.map(app => ({ path: `/${app.id}`, name: app.id }))
        }

        const matched = allRoutes.filter((r) => {
          if (!inputPath || inputPath === '/')
            return true
          const normInput = inputPath.startsWith('/') ? inputPath : `/${inputPath}`
          const normPath = r.path.startsWith('/') ? r.path : `/${r.path}`
          return normPath === normInput
            || normPath.startsWith(normInput)
            || (r.name && r.name.toLowerCase().includes(inputPath.toLowerCase()))
        })

        return {
          appId: request.appId,
          path: inputPath,
          routes: matched,
        }
      }

      case 'components:getRenderCode': {
        await ensureReady()
        const { componentId } = (request.payload ?? {}) as { componentId?: string }
        if (!componentId)
          return undefined
        if (mockMode)
          return mockGetComponentRenderCode(componentId)
        // 探针侧失败如实回落 undefined（官方语义：无 render 可展示）
        const res = await callUni<GetComponentRenderCodeResult>('get-component-render-code', { id: componentId }).catch(() => undefined)
        return res?.code
      }

      case 'components:inspect':
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
        const path = payload.path ?? []
        if (path.length === 0)
          return { status: 0, error: '缺少编辑路径' }
        // 深路径全量透传探针（section/path/remove 官方语义，探针侧逐段解 ref 下钻）；
        // mock 数据是平铺顶层键，深路径在 mock 下如实报不支持
        if (mockMode) {
          if (path.length !== 1 || payload.remove)
            return { status: 0, error: NOT_SUPPORTED('mock 平铺数据的嵌套路径/删除') }
          mockUpdateComponentState({ id: payload.componentId, key: path[0]!, value: payload.value })
        }
        else {
          await callUni('update-component-state', {
            id: payload.componentId,
            section: payload.sectionId,
            path,
            value: payload.value,
            remove: payload.remove,
          })
        }
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
          reason: payload.remove ? 'remove' : 'edit',
        })
        return { status: 1 }
      }

      case 'components:addState':
        return { status: 0, error: NOT_SUPPORTED('新增状态键') }

      case 'inspectors:editState': {
        await ensureReady()
        const payload = request.payload as {
          inspectorId?: string, nodeId?: string, sectionId?: string, path?: string[], value?: unknown, remove?: boolean
        }
        if (payload.inspectorId !== 'pinia')
          return { status: 0, error: NOT_SUPPORTED('该 inspector 的状态编辑') }
        // 聚合根编辑（官方插件 `path.unshift('state')` 的逆向）：面板 path 已去
        // sectionId，形如 [storeId, key, ...嵌套]，翻译回目标 store 的键路径
        let storeId: string
        let path = payload.path ?? []
        if (payload.nodeId === PINIA_ROOT_ID) {
          if (path.length < 2 || !path[0])
            return { status: 0, error: '聚合根编辑需要 [storeId, key, ...] 形式的路径' }
          storeId = path[0]!
          path = path.slice(1)
        }
        else if (payload.nodeId?.startsWith('store:')) {
          storeId = payload.nodeId.slice('store:'.length)
        }
        else {
          return { status: 0, error: NOT_SUPPORTED('该 inspector 的状态编辑') }
        }
        if (path.length === 0)
          return { status: 0, error: '缺少编辑路径' }
        if (mockMode) {
          if (path.length !== 1 || payload.remove)
            return { status: 0, error: NOT_SUPPORTED('mock 平铺数据的嵌套路径/删除') }
          try {
            mockUpdatePiniaState({ id: storeId, key: path[0]!, value: payload.value })
          }
          catch (error) {
            return { status: 0, error: error instanceof Error ? error.message : String(error) }
          }
        }
        else {
          await callUni('update-pinia-state', {
            id: storeId,
            key: path[0]!,
            path,
            value: payload.value,
            remove: payload.remove,
          })
        }
        // 官方刷新语义：inspector 以 nodeId 为维度递增 version（聚合根编辑按
        // 发起视图的 nodeId 失效——当前选中即根视图，刷新它）
        const nodeId = payload.nodeId
        const version = (inspectorVersionByNode.get(nodeId) ?? 0) + 1
        inspectorVersionByNode.set(nodeId, version)
        // 事件名是 kit RuntimeDomainEvent 的 `inspectors:stateInvalidated`
        // （`invalidateState` 是 command 名——写反会被官方事件入口静默丢弃）；
        // nodeId 必带，官方按它判断是否刷新当前选中 store
        emit({
          type: 'inspectors:stateInvalidated',
          inspectorId: 'pinia',
          nodeId,
          reason: 'edit',
        })
        return { status: 1 }
      }

      case 'inspectors:selectNode':
      case 'inspectors:callAction':
      case 'inspectors:callNodeAction':
        // 拉取式实现：选中/动作无需探针侧状态
        return { status: 1 }

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

      case 'router:navigate': {
        if (mockMode)
          return { status: 1 }
        await ensureReady()
        const payload = request.payload as { path?: string }
        if (!payload?.path)
          return { status: 0, error: '缺少跳转路径' }
        try {
          const res = await callUni<{ ok: boolean, error?: string }>('navigate-to', { path: payload.path })
          if (res?.ok === false)
            return { status: 0, error: res.error || '页面跳转失败' }
          return { status: 1 }
        }
        catch (error) {
          return { status: 0, error: error instanceof Error ? error.message : String(error) }
        }
      }

      case 'values:recompute': {
        await ensureReady()
        const payload = request.payload as {
          componentId: string, sectionId: string, path: string[]
        }
        if (!payload?.componentId)
          return { status: 0, error: '缺少 componentId' }
        try {
          if (!mockMode) {
            await callUni('recompute-component-state', {
              id: payload.componentId,
              section: payload.sectionId,
              path: payload.path,
            })
          }
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
        catch (error) {
          return { status: 0, error: error instanceof Error ? error.message : String(error) }
        }
      }

      case 'values:customAction':
        return { status: 0, error: NOT_SUPPORTED('自定义值动作') }

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
    uniNetwork,
    dispose() {
      disposed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }
      if (mockTickTimer) {
        clearInterval(mockTickTimer)
        mockTickTimer = undefined
      }
      unsubSharedState?.()
      unsubSharedState = undefined
      unsubNetworkSharedState?.()
      unsubNetworkSharedState = undefined
      networkListeners.clear()
      if (activeUniNetwork === uniNetwork)
        activeUniNetwork = undefined
      resetConnectionState()
      client?.close?.()
      client = undefined
      eventHandlers.clear()
      connectionHandlers.clear()
    },
  } as DevtoolsRpcClient & { uniNetwork: UniNetworkApi }
}
