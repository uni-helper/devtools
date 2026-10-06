/**
 * 渲染上报（回归：「小程序里改 setup 值，面板不刷新」）。
 *
 * 树推送有内容门（push.ts 的 lastPushedTreeJson），而树节点只有 id/name/type/file
 * ——setup 值变化不改树结构，只推树时面板收不到任何信号。所以渲染钩子必须额外
 * 上报「哪个组件重渲染了」，node 侧才有机会判断「是不是面板正在看的那个组件」。
 *
 * 上报窗口是合并（coalesce）而非防抖：持续重渲染的组件（动画/倒计时）不能因为
 * 定时器被反复重置而永远不发声。
 */
import { NODE_RPC } from '@uni-helper/devtools-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __uniDevtoolsNotifyRender } from '../src/runtime/render-hook'
import { bindPushDeps, resetPushGate } from '../src/runtime/push'
import { clearInstanceRegistry, extractComponentNode } from '../src/runtime/tree'

interface Call {
  method: string
  payload: unknown
}

/** 绑定可记录的推送依赖；返回值即探针出站调用流水 */
function recordCalls(): Call[] {
  const calls: Call[] = []
  bindPushDeps({
    getActiveInstance: () => ({
      rpc: {
        $call: async (method: string, payload: unknown) => {
          calls.push({ method, payload })
        },
      },
      socketHandle: { isConnected: () => true },
    }),
  })
  return calls
}

const notifyCalls = (calls: Call[]) => calls.filter(c => c.method === NODE_RPC.notifyComponentRendered)

/** 组件的（被包装的）render：以组件实例为 this 调用即模拟一次渲染 */
function renderOf(): (this: unknown, ...args: unknown[]) => unknown {
  return __uniDevtoolsNotifyRender(() => null) as any
}

describe('组件重渲染上报', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearInstanceRegistry()
    resetPushGate()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearInstanceRegistry()
  })

  it('渲染过的组件把 id 上报给 node', async () => {
    const calls = recordCalls()
    const vm = { $: { uid: 7, type: { name: 'CounterCard' } } }
    extractComponentNode(vm, 0, 10, new Set(), 'pages/index/index')

    renderOf().call(vm)
    await vi.advanceTimersByTimeAsync(400)

    expect(notifyCalls(calls)).toEqual([
      { method: NODE_RPC.notifyComponentRendered, payload: { ids: ['pages/index/index#7'] } },
    ])
  })

  it('窗口内多个组件的渲染合并成一次上报', async () => {
    const calls = recordCalls()
    const a = { $: { uid: 1, type: { name: 'A' } } }
    const b = { $: { uid: 2, type: { name: 'B' } } }
    extractComponentNode(a, 0, 10, new Set(), 'pages/index/index')
    extractComponentNode(b, 0, 10, new Set(), 'pages/index/index')

    renderOf().call(a)
    renderOf().call(b)
    renderOf().call(a)
    await vi.advanceTimersByTimeAsync(400)

    expect(notifyCalls(calls)).toEqual([
      { method: NODE_RPC.notifyComponentRendered, payload: { ids: ['pages/index/index#1', 'pages/index/index#2'] } },
    ])
  })

  it('持续重渲染不会被饿死，且仍按窗口合并', async () => {
    const calls = recordCalls()
    const vm = { $: { uid: 3, type: { name: 'Ticker' } } }
    extractComponentNode(vm, 0, 10, new Set(), 'pages/index/index')
    const render = renderOf()

    // t=0/100/200/300/400/500 各渲染一次，300ms 窗口 → 恰好在 t=300、t=600 各发一次。
    // 断言精确次数而非「>=2」：后者在「完全不合并、每次渲染都发」的实现下也会通过，
    // 拦不住合并逻辑写错。
    for (let i = 0; i < 6; i++) {
      render.call(vm)
      await vi.advanceTimersByTimeAsync(100)
    }

    expect(notifyCalls(calls)).toEqual([
      { method: NODE_RPC.notifyComponentRendered, payload: { ids: ['pages/index/index#3'] } },
      { method: NODE_RPC.notifyComponentRendered, payload: { ids: ['pages/index/index#3'] } },
    ])
  })

  it('采树拿到内部实例、渲染以 proxy 为 this 时仍能对上 id', async () => {
    const calls = recordCalls()
    const proxy = { $: undefined as any }
    const internal = { uid: 11, type: { name: 'PageLike' }, proxy }
    proxy.$ = internal
    // 页面/defineExpose 场景：采树收到的对象不一定是渲染时的 this
    extractComponentNode(internal, 0, 10, new Set(), 'pages/index/index')

    renderOf().call(proxy)
    await vi.advanceTimersByTimeAsync(400)

    expect(notifyCalls(calls)).toEqual([
      { method: NODE_RPC.notifyComponentRendered, payload: { ids: ['pages/index/index#11'] } },
    ])
  })

  it('以 _renderProxy 为 this 渲染（Vue 2 开发态）时也能对上 id', async () => {
    const calls = recordCalls()
    // Vue 2 dev：render.call(vm._renderProxy, ...)，_renderProxy 是 vm 的 Proxy，
    // WeakMap 按引用隔离，只注册 vm 会对不上
    const vm: any = { _uid: 5, $options: { name: 'Vue2Comp' } }
    vm._renderProxy = { __renderProxyOf: vm }
    extractComponentNode(vm, 0, 10, new Set(), 'pages/index/index')

    renderOf().call(vm._renderProxy)
    await vi.advanceTimersByTimeAsync(400)

    expect(notifyCalls(calls)).toEqual([
      { method: NODE_RPC.notifyComponentRendered, payload: { ids: ['pages/index/index#5'] } },
    ])
  })

  it('未注册实例（渲染早于首次采树）静默跳过，不炸渲染', async () => {
    const calls = recordCalls()
    const vm = { $: { uid: 99, type: { name: 'NotCollectedYet' } } }

    expect(() => renderOf().call(vm)).not.toThrow()
    await vi.advanceTimersByTimeAsync(400)

    expect(notifyCalls(calls)).toHaveLength(0)
  })
})
