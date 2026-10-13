import { describe, expect, it, vi } from 'vitest'
import { AGENT_CLIENT_MARKER, AgentRegistry } from '../src/relay.ts'

/**
 * AgentRegistry：同一时刻只认一个探针（最新连上的那个）。
 *
 * 用假的 birpc 客户端模拟 devframe 的会话：`$meta` 与 onPeerDisconnect 传回的
 * meta 是同一个对象，rpcGroup.clients 是在线列表。
 */
function createAgent(
  impl: (method: string, ...args: any[]) => Promise<any> = async () => 'ok',
) {
  const meta = {}
  return { $meta: meta, $call: vi.fn(impl) }
}

function createHarness() {
  const clients: any[] = []
  const registry = new AgentRegistry({ timeout: 50 })
  registry.bind({ clients } as any)

  const connect = (agent: ReturnType<typeof createAgent>) => {
    clients.push(agent)
    registry.connect(
      {
        id: clients.length,
        request: { url: `/__ws?${AGENT_CLIENT_MARKER}` },
      } as any,
      { rpc: agent, meta: agent.$meta } as any,
    )
  }
  const disconnect = (agent: ReturnType<typeof createAgent>) => {
    clients.splice(clients.indexOf(agent), 1)
    registry.disconnect({} as any, agent.$meta as any)
  }
  return { registry, clients, connect, disconnect }
}

describe('AgentRegistry：最新连上的探针生效', () => {
  it('两台设备在线时，调用只落到后连上的那台', async () => {
    const h = createHarness()
    const simulator = createAgent()
    const device = createAgent()
    h.connect(simulator)
    h.connect(device)

    await h.registry.callAgent('uni-devtools:agent:getComponentTree')

    expect(device.$call).toHaveBeenCalledTimes(1)
    expect(simulator.$call).not.toHaveBeenCalled()
  })

  it('活跃设备断开后回落到仍在线的次新设备', async () => {
    const h = createHarness()
    const simulator = createAgent()
    const device = createAgent()
    h.connect(simulator)
    h.connect(device)

    h.disconnect(device)
    await h.registry.callAgent('uni-devtools:agent:getComponentTree')

    expect(simulator.$call).toHaveBeenCalledTimes(1)
  })

  it('面板等非探针连接不登记', () => {
    const h = createHarness()
    const panel = createAgent()
    h.clients.push(panel)
    h.registry.connect(
      { id: 1, request: { url: '/__ws' } } as any,
      { rpc: panel } as any,
    )

    expect(h.registry.connected).toBe(false)
  })

  it('活跃探针切换时通知订阅方，全部离线时通知 undefined', () => {
    const h = createHarness()
    const changes: unknown[] = []
    h.registry.onActiveChange((next) => changes.push(next))
    const simulator = createAgent()
    const device = createAgent()

    h.connect(simulator)
    h.connect(device)
    h.disconnect(device)
    h.disconnect(simulator)

    expect(changes).toEqual([simulator, device, simulator, undefined])
  })

  it('只接收活跃探针的推送', () => {
    const h = createHarness()
    const simulator = createAgent()
    const device = createAgent()
    h.connect(simulator)
    h.connect(device)

    expect(h.registry.acceptPushFrom({ rpc: device })).toBe(true)
    expect(h.registry.acceptPushFrom({ rpc: simulator })).toBe(false)
  })

  it('有连接钩子时，未登记会话（面板等）的推送被拒且不抢占活跃位', () => {
    const h = createHarness()
    const device = createAgent()
    h.connect(device)
    const panel = createAgent()
    h.clients.push(panel)

    expect(h.registry.acceptPushFrom({ rpc: panel })).toBe(false)
    expect(h.registry.active).toBe(device)
  })

  it('没有连接钩子时（hub 模式），首次推送即把会话登记为最新探针', () => {
    const h = createHarness()
    const older = createAgent()
    const newer = createAgent()
    h.clients.push(older, newer)

    expect(h.registry.acceptPushFrom({ rpc: older })).toBe(true)
    expect(h.registry.acceptPushFrom({ rpc: newer })).toBe(true)
    expect(h.registry.acceptPushFrom({ rpc: older })).toBe(false)
    expect(h.registry.active).toBe(newer)
  })

  it('不在 rpcGroup 在线列表里的探针被剔除（hub 模式没有断开钩子）', async () => {
    const h = createHarness()
    const simulator = createAgent()
    const device = createAgent()
    h.connect(simulator)
    h.connect(device)

    h.clients.splice(h.clients.indexOf(device), 1)
    await h.registry.callAgent('uni-devtools:agent:getRouterInfo')

    expect(device.$call).not.toHaveBeenCalled()
    expect(simulator.$call).toHaveBeenCalledTimes(1)
  })
})

describe('AgentRegistry：调用语义', () => {
  it('失败的调用不重放（写操作超时后可能已执行）', async () => {
    const h = createHarness()
    const device = createAgent(async () => {
      throw new Error('navigate failed')
    })
    h.connect(device)

    await expect(
      h.registry.callAgent('uni-devtools:agent:navigate', { path: '/a' }),
    ).rejects.toThrow(/navigate failed/)
    expect(device.$call).toHaveBeenCalledTimes(1)
  })

  it('超时报错且只调用一次', async () => {
    const h = createHarness()
    const device = createAgent(() => new Promise(() => {}))
    h.connect(device)

    await expect(
      h.registry.callAgent('uni-devtools:agent:updateComponentState', {}),
    ).rejects.toThrow(/timed out after 50ms/)
    expect(device.$call).toHaveBeenCalledTimes(1)
  })

  it('摊平后的普通对象错误：认 .message，不退化成 [object Object]', async () => {
    const h = createHarness()
    h.connect(
      createAgent(async () => {
        // 探针 Error 经 JSON 出口后的形态
        throw { name: 'Error', message: 'Path "payload" is not navigable' }
      }),
    )

    await expect(
      h.registry.callAgent('uni-devtools:agent:updateComponentState', {}),
    ).rejects.toThrow(/Path "payload" is not navigable/)
  })

  it('没有已知探针时 ping 发现一次；无人应答则报「未连接」', async () => {
    const h = createHarness()
    h.clients.push(
      createAgent(async () => {
        throw new Error('function not found')
      }),
    )

    await expect(
      h.registry.callAgent('uni-devtools:agent:getRouterInfo'),
    ).rejects.toThrow(/No uni-devtools agent connected/)
  })

  it('ping 发现：应答者中取 rpcGroup 末位（最新连上的）作为活跃探针', async () => {
    const h = createHarness()
    const older = createAgent()
    const newer = createAgent()
    h.clients.push(older, newer)

    await h.registry.callAgent('uni-devtools:agent:getRouterInfo')

    expect(h.registry.active).toBe(newer)
    expect(newer.$call).toHaveBeenCalledWith('uni-devtools:agent:getRouterInfo')
  })
})
