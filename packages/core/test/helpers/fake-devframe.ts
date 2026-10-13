import { vi } from 'vitest'
import { createUniDevtoolsDevframe } from '../../src/devframe.ts'
import { AGENT_CLIENT_MARKER, AgentRegistry } from '../../src/relay.ts'

/**
 * 在不起真实 server 的前提下跑 DevframeDefinition.setup：scope 只实现 setup 触及的
 * sharedState / register / getCurrentRpcSession 三个入口。
 *
 * registry 是真实的 AgentRegistry，探针用假 birpc 客户端模拟，这样「哪个探针
 * 活跃」「推送是谁发的」走的是生产代码路径。
 */
export async function setupFakeDevframe() {
  const sharedStates = new Map<string, { value: () => any; mutate: any }>()
  const definitions = new Map<string, any>()
  /** 当前 RPC 调用方（模拟 devframe 的 AsyncLocalStorage 会话） */
  let currentSession: { rpc: unknown } | undefined

  const scope = {
    rpc: {
      async sharedState(key: string, options?: { initialValue?: unknown }) {
        if (!sharedStates.has(key)) {
          const value = structuredClone(options?.initialValue)
          sharedStates.set(key, {
            value: () => value,
            mutate: (fn: (draft: any) => void) => fn(value),
          })
        }
        return sharedStates.get(key)
      },
      register(definition: any) {
        definitions.set(definition.name, definition)
      },
      getCurrentRpcSession: () => currentSession,
    },
  }

  const clients: any[] = []
  const registry = new AgentRegistry({ timeout: 50 })
  const def = createUniDevtoolsDevframe(registry)
  await def.setup!({ rpc: {}, scope: () => scope } as any)
  registry.bind({ clients } as any)

  function connectAgent(impl: (method: string, ...args: any[]) => any) {
    const agent = {
      $meta: {},
      $call: vi.fn(async (...a: [string, ...any[]]) => impl(...a)),
    }
    clients.push(agent)
    registry.connect(
      {
        id: clients.length,
        request: { url: `/__ws?${AGENT_CLIENT_MARKER}` },
      } as any,
      { rpc: agent, meta: agent.$meta } as any,
    )
    return agent
  }

  function disconnectAgent(agent: { $meta: object }) {
    clients.splice(clients.indexOf(agent), 1)
    registry.disconnect({} as any, agent.$meta as any)
  }

  /** 以 `from` 的身份调用 RPC（不传 = 进程内直调，无会话） */
  async function invoke(name: string, payload?: unknown, from?: unknown) {
    const definition = definitions.get(name)
    if (!definition) throw new Error(`RPC "${name}" not registered`)
    currentSession = from ? { rpc: from } : undefined
    try {
      return await definition.handler(payload)
    } finally {
      currentSession = undefined
    }
  }

  return {
    registry,
    definitions,
    invoke,
    connectAgent,
    disconnectAgent,
    state: (key: string) => sharedStates.get(key)!.value(),
  }
}
