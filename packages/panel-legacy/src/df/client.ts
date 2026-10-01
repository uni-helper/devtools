import type { DevframeConnectionStatus } from 'devframe/client'
import { connectDevframe } from 'devframe/client'
import { ref, shallowRef } from 'vue'
import type { ComponentStateResult, ComponentTreeResult, PingResult, UpdateStateParams, UpdateStateResult } from './types'
import { mockComponentState, mockComponentTree, mockUpdateComponentState } from './fixtures'

/** devframe 定义的 scope；node 侧 `ctx.scope(NS)` 与这里必须一致。 */
export const NAMESPACE = 'uni-helper-devtools'

/** 显式 mock 模式：仅当 URL 带 `?mock` 时生效，界面上会常驻横幅提示。 */
export const mockMode = new URLSearchParams(window.location.search).has('mock')

/**
 * scope 后的 RPC 视图。刻意收窄成一个手写接口而不是把官方 client 类型
 * 泄漏进组件层：wire 契约的形状以 `./types.ts` 为准，组件只依赖这个面，
 * 以后换传输/换客户端实现不用动任何 UI。
 */
interface SharedStateLike<T> {
  value: () => T
  on: (event: 'updated', cb: (state: T, patches?: unknown, syncId?: string) => void) => () => void
}

interface ScopedCtx {
  rpc: {
    call: (method: string, ...args: unknown[]) => Promise<unknown>
  }
  sharedState: {
    get: <T extends object>(key: string, options?: { initialValue?: T }) => Promise<SharedStateLike<T>>
  }
}

const status = ref<DevframeConnectionStatus>('connecting')
const lastError = shallowRef<Error | null>(null)

let ctx: ScopedCtx | undefined

async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  if (!ctx)
    throw new Error(`尚未连接到 devframe 服务端，无法调用 ${method}`)
  return await ctx.rpc.call(method, ...args) as T
}

/** 面板唯一的数据出口。组件永远从这里取数，不直接 import devframe。 */
export const api = {
  ping: (): Promise<PingResult> => call<PingResult>('ping'),
  getComponentTree: (): Promise<ComponentTreeResult> => call<ComponentTreeResult>('get-component-tree'),
  getComponentState: (id: string): Promise<ComponentStateResult> => call<ComponentStateResult>('get-component-state', { id }),
  updateComponentState: (params: UpdateStateParams): Promise<UpdateStateResult> => call<UpdateStateResult>('update-component-state', params),
}

/**
 * mock 模式下用假数据顶替同一份 `api` 面，UI 无感知；延迟是为了让
 * loading/skeleton 状态在开发时可见。
 */
const mockApi = {
  ping: async (): Promise<PingResult> => ({ pong: Date.now(), agentConnected: true }),
  getComponentTree: async (): Promise<ComponentTreeResult> => {
    await sleep(200)
    return mockComponentTree()
  },
  getComponentState: async (id: string): Promise<ComponentStateResult> => {
    await sleep(120)
    return mockComponentState(id)
  },
  updateComponentState: async (params: UpdateStateParams): Promise<UpdateStateResult> => {
    await sleep(80)
    return mockUpdateComponentState(params)
  },
}

export const rpc = mockMode ? mockApi : api

/**
 * 鉴权 token 只在 standalone 直连时需要：插件把预共享 token 附在面板 URL 上
 * （`?devframe_auth_token=`，规范避坑清单 §8-2），必须显式传入并关掉
 * simpleAuth，否则服务端拒绝信任、终端还会弹临时验证码。被 Hub 以 iframe
 * 挂载时 URL 不带 token，走父窗口预授权（`getDevframeConnection()`），
 * 这里的解析结果为 undefined，互不干扰。
 */
function readAuthTokenFromUrl(): string | undefined {
  return new URLSearchParams(window.location.search).get('devframe_auth_token') ?? undefined
}

/**
 * 建立 devframe 连接。iframe 内被 Hub 挂载时，官方客户端会复用父窗口
 * 预先准备好的连接（Hub 负责预授权，面板不解析 token）；standalone 直连时
 * 自动回落到拉取 `__connection.json`。
 */
// connect 的重入守卫：当前代码只有 App 挂载时调用一次（重试走整页刷新），
// 但守卫让未来任何“再连一次”的入口都不会并发建连或叠加事件订阅。
let connecting: Promise<void> | null = null
let unsubscribes: Array<() => void> = []

export function connect(): Promise<void> {
  if (mockMode) {
    status.value = 'connected'
    return Promise.resolve()
  }
  if (status.value === 'connected')
    return Promise.resolve()
  if (!connecting) {
    connecting = doConnect().finally(() => {
      connecting = null
    })
  }
  return connecting
}

async function doConnect(): Promise<void> {
  status.value = 'connecting'
  lastError.value = null
  try {
    const client = await connectDevframe({
      authToken: readAuthTokenFromUrl(),
      simpleAuth: false,
    })
    const scoped = client.scope(NAMESPACE) as unknown as ScopedCtx
    // 重连前退订旧客户端的事件，避免监听器随重试次数堆积（评审 P1-5）。
    for (const off of unsubscribes)
      off()
    unsubscribes = []
    unsubscribes.push(client.events.on('connection:status', (next) => {
      status.value = next
    }))
    unsubscribes.push(client.events.on('connection:error', (error) => {
      lastError.value = error
    }))
    // 先订阅再同步，避免连接在订阅与读取之间翻转导致漏掉终态。
    ctx = scoped
    status.value = client.status
  }
  catch (error) {
    lastError.value = error as Error
    status.value = 'error'
    throw error
  }
}

export { status as connectionStatus, lastError as connectionError }

/**
 * 订阅 node 侧的组件树 sharedState（key `component-tree`）：探针把树快照推给
 * node，node 写 sharedState，这里收到 `updated` 即面板实时跟随（P6 双向链路
 * 的「小程序 → Web」方向）。返回退订函数。
 *
 * 首次加载仍走 `getComponentTree`（query RPC）；sharedState 的价值在断线重连
 * 后仍能拿到最新快照、以及不依赖面板主动轮询。
 */
export async function subscribeComponentTree(onSnapshot: (snapshot: ComponentTreeResult) => void): Promise<() => void> {
  if (mockMode || !ctx)
    return () => {}
  const shared = await ctx.sharedState.get<ComponentTreeResult>('component-tree', {
    initialValue: { fetchedAt: 0, pages: [] },
  })
  return shared.on('updated', (snapshot) => {
    if (snapshot && Array.isArray(snapshot.pages))
      onSnapshot(snapshot)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
