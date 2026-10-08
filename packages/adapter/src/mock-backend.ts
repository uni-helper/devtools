/**
 * ProbeBackend mock 实现：fixtures 的内存分发，仅 `?mock` 调试模式加载。
 * 与真实探针的语义对齐点（读时深拷贝、编辑写回内存、键不存在抛错）见
 * fixtures.ts 各函数注释；方法面与 node 侧 RPC 一一对应（backend.ts ProbeMethod）。
 */
import type {
  ProbeBackend,
  ProbeMethod,
  ProbePushKey,
  ProbeSubscription,
} from './backend.ts'
import type {
  GetRegisteredRoutesResult,
  RouterInfoResult,
} from '@uni-helper/devtools-shared'
import { probeNotSupported } from './backend.ts'
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
} from './fixtures.ts'

export interface MockBackendOptions {
  /** network 心跳间隔 ms；默认 1000，测试注入小值配合 vi.useFakeTimers */
  networkTickInterval?: number
}

/**
 * mock 注册路由（原 mockRouterSnapshot().routes）：router:snapshot / matchedRoutes
 * 的共享回落逻辑按此产出与旧 mock 早退分支等价的快照（name = path 去首斜杠）。
 */
const MOCK_ROUTES: GetRegisteredRoutesResult['routes'] = [
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
]

const MOCK_CURRENT_ROUTE: RouterInfoResult = {
  currentRoute: { path: '/pages/index/index', fullPath: '/pages/index/index' },
  stack: [],
}

type Payload = Record<string, unknown> | undefined

function idOf(payload: Payload): string {
  return (payload as { id?: string } | undefined)?.id ?? ''
}

const handlers: Record<ProbeMethod, (payload: Payload) => unknown> = {
  'get-component-tree': () => mockComponentTree(),
  'get-component-state': (payload) => mockComponentState(idOf(payload)),
  // 真实探针对深路径逐段解 ref 下钻、支持 remove；mock 数据是平铺顶层键，如实报不支持
  'update-component-state': (payload) => {
    const p = payload as {
      id?: string
      path?: string[]
      value?: unknown
      remove?: boolean
    }
    if (!p?.path || p.path.length !== 1 || p.remove)
      throw new Error(probeNotSupported('mock 平铺数据的嵌套路径/删除'))
    return mockUpdateComponentState({
      id: p.id ?? '',
      key: p.path[0]!,
      value: p.value,
    })
  },
  'get-component-render-code': (payload) => {
    // 真实探针返回 GetComponentRenderCodeResult { code? }；未知 id 如实为空
    const code = mockGetComponentRenderCode(idOf(payload))
    return code == null ? {} : { code }
  },
  'get-pinia-stores': () => mockPiniaStores(),
  'get-pinia-state': (payload) => mockPiniaState(idOf(payload)),
  // mockUpdatePiniaState 对键不存在/getters 抛错，语义对齐真实探针
  'update-pinia-state': (payload) => {
    const p = payload as { id?: string; key?: string; value?: unknown }
    return mockUpdatePiniaState({
      id: p?.id ?? '',
      key: p?.key ?? '',
      value: p?.value,
    })
  },
  // 真实探针返回 GetNetworkRecordsResult { records }；pull 侧按 res.records 读取
  'get-network-records': () => ({ records: mockNetworkRecords() }),
  'clear-network-records': () => {
    mockClearNetworkRecords()
    return { ok: true }
  },
  'get-registered-routes': () => ({ routes: MOCK_ROUTES }),
  'get-router-info': () => MOCK_CURRENT_ROUTE,
  'navigate-to': () => ({ ok: true }),
  'open-in-editor': () => {
    throw new Error(probeNotSupported('mock 模式不支持在编辑器中打开'))
  },
  'get-inspect-status': () => ({ available: false }),
  'recompute-component-state': () => ({}),
}

export function createMockBackend(
  options: MockBackendOptions = {},
): ProbeBackend {
  const tickInterval = options.networkTickInterval ?? 1000
  let tickTimer: ReturnType<typeof setInterval> | undefined
  let disposed = false
  const networkListeners = new Set<(snapshot: unknown) => void>()

  /** 心跳推送：包装成 node 侧 sharedState 同款共享态形状，面板侧走同一套校验。 */
  function pushNetworkSnapshot(): void {
    if (networkListeners.size === 0) return
    const records = mockTickNetworkRecords()
    const snapshot = {
      records,
      latestId: records.reduce((max, r) => Math.max(max, r.id), 0),
      updatedAt: Date.now(),
    }
    for (const cb of [...networkListeners]) cb(snapshot)
  }

  return {
    capabilities: { openInEditor: false },

    async connect() {},

    onConnectionStatus() {
      return () => {}
    },

    async call(method, ...args) {
      const handler = handlers[method]
      if (!handler) throw new Error(`mock 后端暂不支持 ${method}`)
      return await handler(args[0] as Payload)
    },

    subscribe(
      key: ProbePushKey,
      cb: (snapshot: unknown) => void,
    ): ProbeSubscription {
      if (key === 'component-tree') {
        // 静态树：连接即推一次（对齐真实 sharedState 首推语义）
        cb(mockComponentTree())
        return { ready: Promise.resolve(), unsubscribe: () => {} }
      }
      if (key === 'rendered-components') {
        // fixtures 是静态数据，没有「端上改值」可模拟——订阅成功但永不推送
        return { ready: Promise.resolve(), unsubscribe: () => {} }
      }
      networkListeners.add(cb)
      if (!tickTimer && !disposed)
        tickTimer = setInterval(pushNetworkSnapshot, tickInterval)
      return {
        ready: Promise.resolve(),
        unsubscribe() {
          networkListeners.delete(cb)
          if (networkListeners.size === 0 && tickTimer) {
            clearInterval(tickTimer)
            tickTimer = undefined
          }
        },
      }
    },

    dispose() {
      disposed = true
      if (tickTimer) {
        clearInterval(tickTimer)
        tickTimer = undefined
      }
      networkListeners.clear()
    },
  }
}
