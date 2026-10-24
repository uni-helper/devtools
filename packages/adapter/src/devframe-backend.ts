/**
 * ProbeBackend 真实实现：包住 devframe client 的连接生命周期与 scoped RPC。
 * 从 uni-devtools-rpc 的 initConnection 传输部分抽出，行为等同。
 *
 * 生命周期：实例随每次 initConnection 新建，旧实例 dispose——官方连接层会在
 * 健康检查失败/stop 时 dispose 旧 client 并择机新建，模块级单例会让第二个
 * 实例永久瘫痪。
 */
import type {
  ProbeBackend,
  ProbeConnectionStatus,
  ProbePushKey,
  ProbeSubscription,
} from './backend.ts'
import { connectDevframe } from 'devframe/client'

/** 与 node 侧 `ctx.scope(NS)` 一致；改这里必须同步改 node 侧。 */
const NAMESPACE = 'uni-helper-devtools'

interface SharedStateLike<T> {
  on: (event: 'updated', cb: (state: T) => void) => () => void
}

interface ScopedCtx {
  rpc: {
    call: (method: string, ...args: unknown[]) => Promise<unknown>
    /** 正确入口是 scoped.rpc.sharedState(key, options)，与 node 侧对称；
     *  scope 对象本身没有 sharedState 属性（曾想当然写成 sharedState.get）。 */
    sharedState: <T extends object>(
      key: string,
      options?: { initialValue?: T },
    ) => Promise<SharedStateLike<T>>
  }
}

/**
 * 各 push 通道的 sharedState 初值。
 *
 * node 侧 `sharedState(key, { initialValue })` 只在首次创建时取初值，两端必须一致，
 * 否则先连上的一方会把形状写歪（后续订阅方读到的字段是 undefined）。
 */
const INITIAL_VALUE_BY_KEY: Record<ProbePushKey, object> = {
  'component-tree': { fetchedAt: 0, pages: [] },
  'network-records': { records: [], latestId: 0, updatedAt: 0 },
  'rendered-components': { ids: [], seq: 0, updatedAt: 0 },
}

/** standalone 直连时 token 附在面板 URL 上；hub iframe 场景为空。 */
export function readAuthTokenFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return (
    new URLSearchParams(window.location?.search ?? '').get(
      'devframe_auth_token',
    ) ?? undefined
  )
}

export function createDevframeBackend(): ProbeBackend {
  let client: Awaited<ReturnType<typeof connectDevframe>> | undefined
  let scoped: ScopedCtx | undefined
  let disposed = false
  const statusHandlers = new Set<(status: ProbeConnectionStatus) => void>()

  function emitStatus(status: ProbeConnectionStatus): void {
    for (const handler of [...statusHandlers]) handler(status)
  }

  return {
    capabilities: { openInEditor: true },

    async connect(authToken?: string): Promise<void> {
      const connected = await connectDevframe({
        authToken,
        simpleAuth: false,
      })
      if (disposed) {
        connected.close?.()
        throw new Error('adapter disposed')
      }
      client = connected
      scoped = client.scope(NAMESPACE) as unknown as ScopedCtx

      // 关键修复：等待底层 socket 真正连上（'connected' 事件），避免在 socket 仍处于
      // connecting 状态时过早 resolve 并在发出请求时报错 'RPC not connected'
      if ((client.status as string) !== 'connected') {
        await new Promise<void>((resolve, reject) => {
          let unsub: (() => void) | undefined
          unsub = client!.events.on('connection:status', (status) => {
            if (status === 'connected') {
              unsub?.()
              resolve()
            } else if (status !== 'connecting') {
              unsub?.()
              reject(new Error(`devframe socket 连接失败: ${status}`))
            }
          })
          if (disposed) {
            unsub?.()
            reject(new Error('adapter disposed'))
          }
        })
      }

      // 持续监听后续连接状态变更（如服务端断开等）；'connected' 透传给调用方
      // （connection 层的 runtime-changed 语义依赖它），断开由调用方清态重连
      client.events.on('connection:status', (status) => {
        if (status === 'connected') emitStatus('connected')
        else if (status !== 'connecting') emitStatus('closed')
      })
    },

    onConnectionStatus(cb) {
      statusHandlers.add(cb)
      return () => {
        statusHandlers.delete(cb)
      }
    },

    async call(method, ...args) {
      if (!scoped) throw new Error('uni-devtools RPC 尚未连接')
      return await scoped.rpc.call(method, ...args)
    },

    subscribe(
      key: ProbePushKey,
      cb: (snapshot: unknown) => void,
    ): ProbeSubscription {
      let unsub: (() => void) | undefined
      let cancelled = false
      const ready = (async () => {
        if (!scoped) throw new Error('uni-devtools RPC 尚未连接')
        const shared = await scoped.rpc.sharedState(key, {
          initialValue: INITIAL_VALUE_BY_KEY[key],
        })
        if (cancelled || disposed) return
        unsub = shared.on('updated', cb)
      })()
      return {
        ready,
        unsubscribe() {
          cancelled = true
          unsub?.()
          unsub = undefined
        },
      }
    },

    dispose() {
      disposed = true
      statusHandlers.clear()
      client?.close?.()
      client = undefined
      scoped = undefined
    },
  }
}
