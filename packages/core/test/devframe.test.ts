import { describe, expect, it } from 'vitest'
import {
  DEVFRAME_INTERNAL_RPC,
  DEVFRAME_RPC,
} from '@uni-helper/devtools-shared'
import { AGENT_RPC } from '../src/rpc-names.ts'
import { setupFakeDevframe } from './helpers/fake-devframe.ts'

const tree = (route: string) => ({
  fetchedAt: 1,
  pages: [{ route, components: null }],
})

/** 让 onActiveChange 里 fire-and-forget 的拉取跑完 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('devframe：只认活跃探针', () => {
  it('非活跃探针的推送被丢弃，活跃探针的推送写入 sharedState', async () => {
    const ctx = await setupFakeDevframe()
    const simulator = ctx.connectAgent(() => tree('pages/sim'))
    const device = ctx.connectAgent(() => tree('pages/device'))
    await flush()

    const ignored = await ctx.invoke(
      DEVFRAME_INTERNAL_RPC.pushComponentTree,
      tree('pages/sim-late'),
      simulator,
    )
    expect(ignored).toEqual({ ok: true, ignored: true })
    expect(ctx.state('component-tree').pages[0].route).toBe('pages/device')

    await ctx.invoke(
      DEVFRAME_INTERNAL_RPC.pushComponentTree,
      tree('pages/device-2'),
      device,
    )
    expect(ctx.state('component-tree').pages[0].route).toBe('pages/device-2')
  })

  it('切换到新探针时清掉上一台设备的网络记录，并主动从新探针拉取', async () => {
    const ctx = await setupFakeDevframe()
    const simulator = ctx.connectAgent((method) =>
      method === AGENT_RPC.getNetworkRecords
        ? { records: [], latestId: 0 }
        : tree('pages/sim'),
    )
    await flush()
    await ctx.invoke(
      DEVFRAME_INTERNAL_RPC.pushNetworkRecords,
      { records: [{ id: 1, url: 'https://sim' }] },
      simulator,
    )
    expect(ctx.state('network-records').records).toHaveLength(1)

    ctx.connectAgent((method) =>
      method === AGENT_RPC.getNetworkRecords
        ? { records: [{ id: 7, url: 'https://device' }], latestId: 7 }
        : tree('pages/device'),
    )
    await flush()

    expect(ctx.state('network-records').records.map((r: any) => r.url)).toEqual(
      ['https://device'],
    )
    expect(ctx.state('component-tree').pages[0].route).toBe('pages/device')
  })

  it('全部离线后保留最后快照，get-component-tree 返回并标记 stale', async () => {
    const ctx = await setupFakeDevframe()
    const device = ctx.connectAgent(() => tree('pages/device'))
    await flush()

    ctx.disconnectAgent(device)
    const result = await ctx.invoke(DEVFRAME_RPC.getComponentTree)

    expect(result).toMatchObject({ stale: true })
    expect(result.pages[0].route).toBe('pages/device')
  })

  it('转发类 RPC 在探针离线时如实报错，不再吞成空结果', async () => {
    const ctx = await setupFakeDevframe()

    await expect(ctx.invoke(DEVFRAME_RPC.getPiniaStores)).rejects.toThrow(
      /No uni-devtools agent connected/,
    )
  })

  it('探针离线时清空网络记录仍成功，并如实回报探针侧未清', async () => {
    const ctx = await setupFakeDevframe()

    expect(await ctx.invoke(DEVFRAME_RPC.clearNetworkRecords)).toEqual({
      ok: true,
      agentCleared: false,
    })
  })
})

describe('devframe：MCP 暴露面', () => {
  it('探针推送入口不带 agent 元数据（不暴露给 Coding Agent）', async () => {
    const ctx = await setupFakeDevframe()
    for (const name of [
      DEVFRAME_INTERNAL_RPC.pushComponentTree,
      DEVFRAME_INTERNAL_RPC.pushNetworkRecords,
      DEVFRAME_INTERNAL_RPC.notifyComponentRendered,
      DEVFRAME_INTERNAL_RPC.notifyStorageChanged,
    ]) {
      expect(ctx.definitions.get(name)?.agent).toBeUndefined()
    }
  })

  it('所有公开 RPC 都带 agent 描述，带参数的都声明了参数 schema', async () => {
    const ctx = await setupFakeDevframe()
    const withoutArgs = new Set<string>([
      DEVFRAME_RPC.getComponentTree,
      DEVFRAME_RPC.getRouterInfo,
      DEVFRAME_RPC.getRegisteredRoutes,
      DEVFRAME_RPC.getInspectStatus,
      DEVFRAME_RPC.getPiniaStores,
      DEVFRAME_RPC.getVuexStores,
      DEVFRAME_RPC.clearNetworkRecords,
      DEVFRAME_RPC.getStorageInfo,
    ])
    for (const name of Object.values(DEVFRAME_RPC)) {
      const definition = ctx.definitions.get(name)
      expect(definition?.agent?.description, name).toBeTruthy()
      if (!withoutArgs.has(name)) expect(definition?.args, name).toBeDefined()
    }
  })

  it('参数 schema 投影出 MCP 可读的 JSON Schema，并在运行时拦截类型错误', async () => {
    const ctx = await setupFakeDevframe()
    const [arg] = ctx.definitions.get(DEVFRAME_RPC.getComponentState).args
    const standard = arg['~standard']

    expect(standard.jsonSchema.input()).toMatchObject({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    })
    expect(standard.validate({ id: 'pages/index#1', extra: 1 }).issues).toBe(
      undefined,
    )
    expect(standard.validate({ id: 42 }).issues?.[0]).toMatchObject({
      path: ['id'],
    })
  })

  it('清空网络记录标为 destructive，改状态的 RPC 是 action', async () => {
    const ctx = await setupFakeDevframe()

    expect(
      ctx.definitions.get(DEVFRAME_RPC.clearNetworkRecords).agent.safety,
    ).toBe('destructive')
    for (const name of [
      DEVFRAME_RPC.updateComponentState,
      DEVFRAME_RPC.recomputeComponentState,
      DEVFRAME_RPC.updatePiniaState,
      DEVFRAME_RPC.updateVuexState,
      DEVFRAME_RPC.navigateTo,
    ])
      expect(ctx.definitions.get(name).type, name).toBe('action')
  })
})
