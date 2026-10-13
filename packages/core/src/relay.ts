import type { BirpcGroup, BirpcReturn } from 'birpc'
import type {
  DevframeNodeRpcSession,
  DevframeNodeRpcSessionMeta,
  DevframeRpcConnection,
} from 'devframe/types'
import { AGENT_RPC } from './rpc-names.ts'

/** URL marker attached by the mini-program agent probe */
export const AGENT_CLIENT_MARKER = 'client=uni-agent'

export type AgentClient = BirpcReturn<
  Record<string, (...args: any[]) => any>,
  Record<string, never>,
  false
>

export type BirpcGroupResolver =
  | BirpcGroup<any, any, false>
  | (() => BirpcGroup<any, any, false> | undefined)

/** 调用方会话的最小结构面（devframe 的 `DevframeNodeRpcSession` 天然满足） */
export interface AgentSessionLike {
  rpc?: AgentClient | unknown
}

export type ActiveAgentListener = (
  next: AgentClient | undefined,
  prev: AgentClient | undefined,
) => void

const DEFAULT_CALL_TIMEOUT = 5_000

/**
 * 取出跨进程传来的错误文案。
 *
 * 探针抛的 Error 经 JSON 出口被摊平成 `{ name, message }`（见 socket.ts 的 wireReplacer），
 * 不再是 Error 实例；这里要认这种形态，否则错误文案退化成 `[object Object]`。
 */
function describeAgentError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }
  return String(err)
}

/**
 * AgentRegistry：同一时刻只有一个「活跃探针」。
 *
 * 规则是**最新连上的探针生效**：模拟器 + 真机、多台真机同时在线时，所有读写都只
 * 落到最后连上的那一个；它断开后回落到仍在线的次新探针。非活跃探针保持连接但
 * 被忽略——不主动踢掉，否则被踢的一方按退避重连后又成了「最新」，两端会来回抢占。
 *
 * 探针登记有两条入口：
 * - standalone dev server：`onPeerConnect` 钩子按 URL 标记识别（connect / disconnect）
 * - hub 模式没有连接钩子：探针首次推送时经 `acceptPushFrom` 登记；离线由
 *   `pruneDisconnected` 比对 rpcGroup 的在线客户端发现
 */
export class AgentRegistry {
  private groupSource: BirpcGroupResolver | undefined
  /** 插入顺序即连接顺序，末位为活跃探针 */
  private agents = new Set<AgentClient>()
  private readonly defaultTimeout: number
  private readonly activeListeners = new Set<ActiveAgentListener>()
  private lastActive: AgentClient | undefined
  /** 连接钩子是否生效过（standalone）；生效后只认钩子登记的探针，见 acceptPushFrom */
  private peerHooksActive = false
  private readonly unavailableHint: string

  constructor(options: { timeout?: number; unavailableHint?: string } = {}) {
    this.defaultTimeout = options.timeout ?? DEFAULT_CALL_TIMEOUT
    this.unavailableHint =
      options.unavailableHint ??
      'Please ensure the uni-app is running and the devtools agent is injected.'
  }

  bind(group: BirpcGroupResolver | undefined): void {
    this.groupSource = group
  }

  getGroup(): BirpcGroup<any, any, false> | undefined {
    if (typeof this.groupSource === 'function') return this.groupSource()
    return this.groupSource
  }

  /** 活跃探针切换时回调（含「全部离线」→ next 为 undefined）；返回退订函数 */
  onActiveChange(listener: ActiveAgentListener): () => void {
    this.activeListeners.add(listener)
    return () => {
      this.activeListeners.delete(listener)
    }
  }

  connect = (
    connection: DevframeRpcConnection,
    session?: DevframeNodeRpcSession,
  ): void => {
    this.peerHooksActive = true
    const url = connection.request?.url ?? ''
    if (!url.includes(AGENT_CLIENT_MARKER)) return
    const client = session?.rpc as AgentClient | undefined
    if (client) this.register(client)
  }

  disconnect = (
    _connection: DevframeRpcConnection,
    meta?: DevframeNodeRpcSessionMeta,
  ): void => {
    for (const client of this.agents) {
      if ((client as { $meta?: unknown }).$meta === meta) {
        this.unregister(client)
        return
      }
    }
    // meta 对不上（旧版 devframe 未传 meta）时退回在线比对
    this.pruneDisconnected()
  }

  get connected(): boolean {
    this.pruneDisconnected()
    return this.agents.size > 0
  }

  get active(): AgentClient | undefined {
    let last: AgentClient | undefined
    for (const client of this.agents) last = client
    return last
  }

  /** 登记探针并置为活跃（已登记的不改变顺序——「最新」按首次连接计） */
  register(client: AgentClient): void {
    if (this.agents.has(client)) return
    this.agents.add(client)
    this.emitIfActiveChanged()
  }

  unregister(client: AgentClient): void {
    if (this.agents.delete(client)) this.emitIfActiveChanged()
  }

  /**
   * 探针推送的准入判断：只收活跃探针的数据。
   *
   * 未登记的会话：有连接钩子时（standalone）它一定不是探针（面板、MCP 客户端等），
   * 拒收；没有连接钩子时（hub 模式）推送是唯一的登记入口，视为新连上的探针。
   * 拿不到会话（进程内直调、单测）时放行——无法判断来源就不拦。
   */
  acceptPushFrom(session: AgentSessionLike | undefined): boolean {
    const client = session?.rpc as AgentClient | undefined
    if (!client) return true
    this.pruneDisconnected()
    if (!this.agents.has(client)) {
      if (this.peerHooksActive) return false
      this.register(client)
    }
    return client === this.active
  }

  /**
   * 调用活跃探针。
   *
   * 只调一次、不重放：写操作（导航、改状态）超时后其实可能已经执行，重放会导致
   * 页面栈叠层或值被写两次。没有任何已知探针时才做一次 ping 发现（hub 模式 /
   * 登记丢失的兜底）。
   */
  async callAgent<T = any>(method: string, ...args: any[]): Promise<T> {
    this.pruneDisconnected()
    let client = this.active
    if (!client) {
      await this.discoverByPing()
      client = this.active
    }
    if (!client) {
      throw new Error(
        `No uni-devtools agent connected. ${this.unavailableHint}`,
      )
    }
    try {
      return (await withTimeout(
        client.$call(method, ...args),
        this.defaultTimeout,
      )) as T
    } catch (err) {
      throw new Error(
        `uni-devtools agent call "${method}" failed: ${describeAgentError(err)}`,
      )
    }
  }

  /** 剔除已不在 rpcGroup 在线列表里的探针（hub 模式没有 disconnect 钩子） */
  private pruneDisconnected(): void {
    const clients = this.getGroup()?.clients
    if (!clients) return
    let changed = false
    for (const client of this.agents) {
      if (!clients.includes(client)) {
        this.agents.delete(client)
        changed = true
      }
    }
    if (changed) this.emitIfActiveChanged()
  }

  /** ping 所有在线会话，应答者按 rpcGroup 顺序登记（末位即最新连上的） */
  private async discoverByPing(): Promise<void> {
    const clients = (this.getGroup()?.clients ?? []) as AgentClient[]
    const results = await Promise.allSettled(
      clients.map((client) =>
        withTimeout(client.$call(AGENT_RPC.ping), this.defaultTimeout),
      ),
    )
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') this.register(clients[index]!)
    })
  }

  private emitIfActiveChanged(): void {
    const next = this.active
    const prev = this.lastActive
    if (next === prev) return
    this.lastActive = next
    for (const listener of this.activeListeners) listener(next, prev)
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Agent call timed out after ${ms}ms`)),
      ms,
    )
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
