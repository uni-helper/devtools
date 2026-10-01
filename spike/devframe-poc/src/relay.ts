import type { BirpcGroup, BirpcReturn } from 'birpc'
import type { DevframeNodeRpcSession } from 'devframe/types'
import type { DevframeRpcConnection, DevframeNodeRpcSessionMeta } from 'devframe/types'

/**
 * AgentRegistry — node 侧对「已连接探针」的注册与定向调用。
 *
 * spike 验证项（docs/DEVFRAME_MIGRATION_PLAN.md §3.2）：
 * Devframe node 侧能否对特定已连接客户端发起请求-响应调用。
 * 答案：rpcGroup.clients 暴露每个 peer 的 BirpcReturn（$call），
 * 这里在 onPeerConnect 时把最新 client 归属到对应 connection，
 * 并以 ping 扫描兜底（连接顺序假设失败时仍可用）。
 */

/** 探针在连接 URL 上携带的标记（见 src/agent/index.ts 与 plugin 的虚拟模块） */
export const AGENT_CLIENT_MARKER = 'client=uni-agent'

type AgentClient = BirpcReturn<Record<string, (...args: any[]) => any>, Record<string, never>, false>

const CALL_TIMEOUT = 5_000

export class AgentRegistry {
  private group: BirpcGroup<any, any, false> | undefined
  private agents = new Map<number, AgentClient>()

  /** 插件在 instance.ready 后绑定 rpcGroup（来自 getInstanceInternals(instance).started） */
  bind(group: BirpcGroup<any, any, false> | undefined): void {
    this.group = group
  }

  /** initDevframe 的 onPeerConnect 回调 */
  connect = (connection: DevframeRpcConnection, _session: DevframeNodeRpcSession): void => {
    const url = connection.request?.url ?? ''
    if (!url.includes(AGENT_CLIENT_MARKER))
      return
    // 约定：onPeerConnect 触发时该 peer 的 channel 已加入 group，取最新一个；
    // 若顺序假设不成立，callAgent 的扫描兜底仍能工作。
    const clients = this.group?.clients ?? []
    const client = clients[clients.length - 1] as AgentClient | undefined
    if (client)
      this.agents.set(connection.id, client)
  }

  /** initDevframe 的 onPeerDisconnect 回调 */
  disconnect = (connection: DevframeRpcConnection, _meta: DevframeNodeRpcSessionMeta): void => {
    this.agents.delete(connection.id)
  }

  get connected(): boolean {
    return this.agents.size > 0
  }

  /**
   * 定向调用探针函数。优先注册表；失败或为空时对 group 内所有 client
   * 做 ping 扫描（刷新陈旧句柄），再重试一次。
   */
  async callAgent<T = any>(method: string, ...args: any[]): Promise<T> {
    if (this.agents.size > 0) {
      for (const client of this.agents.values()) {
        try {
          return (await withTimeout(client.$call(method, ...args), CALL_TIMEOUT)) as T
        }
        catch (err) {
          console.warn(`[uni-devtools spike] agent call ${method} failed, trying next:`, (err as Error).message)
        }
      }
    }
    await this.refreshByPing()
    for (const client of this.agents.values()) {
      try {
        return (await withTimeout(client.$call(method, ...args), CALL_TIMEOUT)) as T
      }
      catch { /* 尝试下一个 */ }
    }
    throw new Error('No uni-devtools agent connected. 请确认小程序已在运行且探针已注入。')
  }

  /** 用 ping 扫描 group 内全部 client，重建 agents 注册表 */
  private async refreshByPing(): Promise<void> {
    this.agents.clear()
    const clients = (this.group?.clients ?? []) as AgentClient[]
    for (const client of clients) {
      try {
        await withTimeout(client.$call('uni-devtools:agent:ping'), CALL_TIMEOUT)
        this.agents.set(clients.indexOf(client), client)
      }
      catch { /* 不是探针（可能是浏览器面板）或已断开 */ }
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ])
}
