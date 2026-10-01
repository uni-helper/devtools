import type { BirpcGroup, BirpcReturn } from 'birpc'
import type { DevframeNodeRpcSession, DevframeNodeRpcSessionMeta, DevframeRpcConnection } from 'devframe/types'
import type { ComponentTreeResult } from './types.ts'

/** URL marker attached by the mini-program agent probe */
export const AGENT_CLIENT_MARKER = 'client=uni-agent'

export type AgentClient = BirpcReturn<Record<string, (...args: any[]) => any>, Record<string, never>, false>

export type BirpcGroupResolver = BirpcGroup<any, any, false> | (() => BirpcGroup<any, any, false> | undefined)

const DEFAULT_CALL_TIMEOUT = 5_000

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

  /**
   * Bind the underlying RPC group or a resolver returning the group.
   */
  bind(group: BirpcGroupResolver | undefined): void {
    this.groupSource = group
  }

  /**
   * Get the current active BirpcGroup instance if bound.
   */
  getGroup(): BirpcGroup<any, any, false> | undefined {
    if (typeof this.groupSource === 'function')
      return this.groupSource()
    return this.groupSource
  }

  /**
   * Hook for connection lifecycle (e.g. onPeerConnect).
   */
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

  /**
   * Hook for disconnection lifecycle (e.g. onPeerDisconnect).
   */
  disconnect = (connection: DevframeRpcConnection, _meta?: DevframeNodeRpcSessionMeta): void => {
    this.agents.delete(connection.id)
  }

  /**
   * Returns whether at least one agent is currently registered.
   */
  get connected(): boolean {
    return this.agents.size > 0
  }

  /**
   * Call a remote method on an agent peer.
   * Tries registered agents first; falls back to ping-scanning the group
   * to discover/refresh agent handles, then retries.
   */
  async callAgent<T = any>(method: string, ...args: any[]): Promise<T> {
    if (this.agents.size > 0) {
      for (const client of this.agents.values()) {
        try {
          return (await withTimeout(client.$call(method, ...args), this.defaultTimeout)) as T
        }
        catch {
          // Try next agent
        }
      }
    }

    await this.refreshByPing()

    for (const client of this.agents.values()) {
      try {
        return (await withTimeout(client.$call(method, ...args), this.defaultTimeout)) as T
      }
      catch {
        // Try next agent
      }
    }

    throw new Error('No uni-devtools agent connected. Please ensure the uni-app is running and the devtools agent is injected.')
  }

  /**
   * Ping all connected RPC clients to discover agents and update the internal registry.
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
