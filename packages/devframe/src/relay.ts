import type { BirpcGroup, BirpcReturn } from 'birpc'
import type { DevframeNodeRpcSession, DevframeNodeRpcSessionMeta, DevframeRpcConnection } from 'devframe/types'
import type { ComponentTreeResult } from './types.ts'

/** URL marker attached by the mini-program agent probe */
export const AGENT_CLIENT_MARKER = 'client=uni-agent'

export type AgentClient = BirpcReturn<Record<string, (...args: any[]) => any>, Record<string, never>, false>

export type BirpcGroupResolver = BirpcGroup<any, any, false> | (() => BirpcGroup<any, any, false> | undefined)

const DEFAULT_CALL_TIMEOUT = 5_000

/** 「所有 agent 都没调通」的哨兵值：与合法的 undefined 返回值区分开 */
const AGENT_CALL_MISS = Symbol('agent-call-miss')

/**
 * 取出跨进程传来的错误文案。
 *
 * 探针抛的 Error 经 JSON 出口被摊平成 `{ name, message }`（见 socket.ts 的 wireReplacer），
 * 不再是 Error 实例；这里要认这种形态，否则错误文案退化成 `[object Object]`。
 */
function describeAgentError(err: unknown): string {
  if (err instanceof Error)
    return err.message
  if (err && typeof err === 'object') {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string' && message)
      return message
    try {
      return JSON.stringify(err)
    }
    catch {
      return String(err)
    }
  }
  return String(err)
}

/**
 * AgentRegistry
 *
 * Manages connected uni-app mini-program agent probes and provides directed RPC invocation.
 * Supports direct peer tracking via connection lifecycle and self-healing fallback via ping-sweep.
 */
export class AgentRegistry {
  private groupSource: BirpcGroupResolver | undefined
  private agents = new Map<number | string, AgentClient>()
  private defaultTimeout: number
  private cachedTree: ComponentTreeResult | null = null

  constructor(options: { timeout?: number } = {}) {
    this.defaultTimeout = options.timeout ?? DEFAULT_CALL_TIMEOUT
  }

  setCachedTree(tree: ComponentTreeResult | null): void {
    this.cachedTree = tree
  }

  getCachedTree(): ComponentTreeResult | null {
    return this.cachedTree
  }

  bind(group: BirpcGroupResolver | undefined): void {
    this.groupSource = group
  }

  getGroup(): BirpcGroup<any, any, false> | undefined {
    if (typeof this.groupSource === 'function')
      return this.groupSource()
    return this.groupSource
  }

  connect = (connection: DevframeRpcConnection, _session?: DevframeNodeRpcSession): void => {
    const url = connection.request?.url ?? ''
    if (!url.includes(AGENT_CLIENT_MARKER))
      return

    const group = this.getGroup()
    const clients = group?.clients ?? []
    const client = clients[clients.length - 1] as AgentClient | undefined
    if (client)
      this.agents.set(connection.id, client)
  }

  disconnect = (connection: DevframeRpcConnection, _meta?: DevframeNodeRpcSessionMeta): void => {
    this.agents.delete(connection.id)
  }

  get connected(): boolean {
    return this.agents.size > 0
  }

  /**
   * Call a remote method on an agent peer.
   * Tries registered agents first; falls back to ping-scanning the group
   * to discover/refresh agent handles, then retries.
   */
  async callAgent<T = any>(method: string, ...args: any[]): Promise<T> {
    // 收集每次尝试的失败原因：agent 在线但方法本身抛错时，裸报「未连接」会把
    // 真实错误（组件不在注册表、路径不可导航……）藏起来，调用方无法排查。
    const failures: string[] = []

    const tryAllAgents = async (): Promise<T | typeof AGENT_CALL_MISS> => {
      for (const client of this.agents.values()) {
        try {
          return (await withTimeout(client.$call(method, ...args), this.defaultTimeout)) as T
        }
        catch (err) {
          failures.push(describeAgentError(err))
        }
      }
      return AGENT_CALL_MISS
    }

    const direct = await tryAllAgents()
    if (direct !== AGENT_CALL_MISS)
      return direct

    await this.refreshByPing()

    const afterPing = await tryAllAgents()
    if (afterPing !== AGENT_CALL_MISS)
      return afterPing

    if (this.agents.size === 0) {
      throw new Error('No uni-devtools agent connected. Please ensure the uni-app is running and the devtools agent is injected.')
    }

    throw new Error(`uni-devtools agent call "${method}" failed: ${failures.join(' | ')}`)
  }

  /**
   * Ping all connected RPC clients to discover agent peers
   * (self-healing fallback when the registry went stale, e.g. after a sidecar restart).
   */
  async refreshByPing(): Promise<void> {
    this.agents.clear()
    const group = this.getGroup()
    const clients = (group?.clients ?? []) as AgentClient[]

    for (const client of clients) {
      try {
        await withTimeout(client.$call('uni-devtools:agent:ping'), this.defaultTimeout)
        this.agents.set(clients.indexOf(client), client)
      }
      catch {
        // Non-agent peer or disconnected socket, skip
      }
    }
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Agent call timed out after ${ms}ms`)), ms),
    ),
  ])
}
