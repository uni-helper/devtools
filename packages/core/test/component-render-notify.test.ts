/**
 * 组件重渲染上报的 node 侧落点（「小程序里改 setup 值，面板不刷新」的修复）。
 *
 * node 侧**不做过滤**：探针只知道「谁渲染了」，node 也不知道面板在看哪个组件
 * （`get-component-state` 是面板与 MCP agent 共用的入口，拿它当选中态来源会被
 * agent 调用污染）。过滤放在 adapter——`components:stateSnapshot` 是面板专有入口。
 * 这里只锁「原样转发 + seq 单调」这一层。
 */
import { describe, expect, it, vi } from 'vitest'
import { createUniDevtoolsDevframe } from '../src/devframe.ts'
import { AGENT_RPC } from '../src/rpc-names.ts'

/** devframe 的 scope：只实现本用例触及的 sharedState / register 两个入口 */
function createFakeScope() {
  const sharedStates = new Map<string, any>()
  const functions = new Map<string, any>()

  const scope = {
    rpc: {
      async sharedState(key: string, options?: { initialValue?: unknown }) {
        if (!sharedStates.has(key)) {
          const value = options?.initialValue
          sharedStates.set(key, {
            value: () => value,
            mutate: (fn: (draft: any) => void) => {
              fn(value)
            },
          })
        }
        return sharedStates.get(key)
      },
      register(fn: any) {
        functions.set(fn.name, fn)
      },
    },
  }

  return { scope, sharedStates, functions }
}

async function setupDevframe() {
  const registry = {
    bind: vi.fn(),
    setCachedTree: vi.fn(),
    getCachedTree: vi.fn(() => null),
    connected: true,
    callAgent: vi.fn(async (method: string, args: any) => {
      if (method === AGENT_RPC.getComponentState)
        return {
          id: args?.id,
          name: 'CounterCard',
          setup: { count: { value: 1 } },
        }
      return {}
    }),
  }

  const { scope, sharedStates, functions } = createFakeScope()
  const def = createUniDevtoolsDevframe(registry as any)
  await def.setup!({ rpc: {}, scope: () => scope } as any)

  const invoke = (name: string, payload: unknown) =>
    functions.get(name)!.setup().handler(payload)
  const rendered = () => sharedStates.get('rendered-components').value()

  return { registry, invoke, rendered }
}

describe('组件重渲染上报', () => {
  it('把重渲染的组件 id 原样写入 sharedState', async () => {
    const ctx = await setupDevframe()

    await ctx.invoke('notify-component-rendered', {
      ids: ['pages/index/index#4', 'pages/index/index#9'],
    })

    expect(ctx.rendered().ids).toEqual([
      'pages/index/index#4',
      'pages/index/index#9',
    ])
  })

  it('面板在看哪个组件不影响上报（node 不持有选中态）', async () => {
    const ctx = await setupDevframe()
    await ctx.invoke('get-component-state', { id: 'pages/index/index#4' })

    await ctx.invoke('notify-component-rendered', {
      ids: ['pages/index/index#9'],
    })

    expect(ctx.rendered().ids).toEqual(['pages/index/index#9'])
  })

  it('同一批 id 重复上报也推进 seq（订阅方据此识别为新事件）', async () => {
    const ctx = await setupDevframe()

    await ctx.invoke('notify-component-rendered', {
      ids: ['pages/index/index#4'],
    })
    const first = ctx.rendered().seq
    await ctx.invoke('notify-component-rendered', {
      ids: ['pages/index/index#4'],
    })

    expect(ctx.rendered().seq).toBeGreaterThan(first)
  })

  it('空 ids 不写 sharedState', async () => {
    const ctx = await setupDevframe()

    await ctx.invoke('notify-component-rendered', { ids: [] })
    await ctx.invoke('notify-component-rendered', {})

    expect(ctx.rendered().seq).toBe(0)
    expect(ctx.rendered().ids).toEqual([])
  })
})
