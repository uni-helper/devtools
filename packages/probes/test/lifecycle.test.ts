import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NullAdapter } from '../src/adapter/types'

/**
 * lifecycle.ts 持有模块级单例与「进程级全局钩子已安装」标记，二者都不可从外部重置。
 * 因此每个用例用 vi.resetModules() + 动态 import 拿一份全新模块，保证用例间互不串状态。
 */
async function freshLifecycle(): Promise<
  typeof import('../src/runtime/lifecycle')
> {
  vi.resetModules()
  return import('../src/runtime/lifecycle')
}

function baseOptions() {
  return {
    adapter: new NullAdapter(),
    clientFunctions: { 'uni-devtools:agent:ping': () => Date.now() },
    customConfig: { wsUrl: 'ws://test', token: 'test-token' },
  }
}

describe('initAgentPipeline 配置装配', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('wsUrl 缺失时抛错，不留下任何定时器', async () => {
    const lifecycle = await freshLifecycle()

    expect(() =>
      lifecycle.initAgentPipeline({
        adapter: new NullAdapter(),
        clientFunctions: {},
      }),
    ).toThrow(/wsUrl is missing/)

    expect(vi.getTimerCount()).toBe(0)
    expect(lifecycle.getAgentInstance()).toBeNull()
  })

  it('单例防重复初始化：二次调用返回同一实例', async () => {
    const lifecycle = await freshLifecycle()

    const first = lifecycle.initAgentPipeline(baseOptions())
    const second = lifecycle.initAgentPipeline(baseOptions())

    expect(second).toBe(first)
    expect(lifecycle.getAgentInstance()).toBe(first)

    lifecycle.disposeAgent()
  })
})

describe('定时器生命周期（setInterval 泄漏修复）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('初始化启动 1 个快照轮询定时器，disposeAgent 清理干净', async () => {
    const lifecycle = await freshLifecycle()

    lifecycle.initAgentPipeline(baseOptions())
    expect(vi.getTimerCount()).toBe(1)

    lifecycle.disposeAgent()
    expect(vi.getTimerCount()).toBe(0)
    expect(lifecycle.getAgentInstance()).toBeNull()
  })

  it('实例级 instance.dispose() 同样清理定时器与单例', async () => {
    const lifecycle = await freshLifecycle()

    const instance = lifecycle.initAgentPipeline(baseOptions())
    expect(vi.getTimerCount()).toBe(1)

    instance.dispose()
    expect(vi.getTimerCount()).toBe(0)
    expect(lifecycle.getAgentInstance()).toBeNull()
  })

  it('多轮 init/dispose 定时器数量恒为 0 或 1，不累积', async () => {
    const lifecycle = await freshLifecycle()

    for (let round = 0; round < 5; round++) {
      lifecycle.initAgentPipeline(baseOptions())
      expect(vi.getTimerCount()).toBe(1)

      lifecycle.disposeAgent()
      expect(vi.getTimerCount()).toBe(0)
    }
  })
})

describe('进程级全局事件钩子（只安装一次）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    delete (globalThis as any).uni
    delete (globalThis as any).wx
  })

  it('uni.addInterceptor 只注册一轮路由方法，重复初始化不叠加', async () => {
    const addInterceptor = vi.fn()
    ;(globalThis as any).uni = { addInterceptor }

    const lifecycle = await freshLifecycle()

    lifecycle.initAgentPipeline(baseOptions())
    // navigateTo / redirectTo / reLaunch / switchTab / navigateBack
    expect(addInterceptor).toHaveBeenCalledTimes(5)
    expect(addInterceptor.mock.calls.map((call) => call[0])).toEqual([
      'navigateTo',
      'redirectTo',
      'reLaunch',
      'switchTab',
      'navigateBack',
    ])

    lifecycle.disposeAgent()
    lifecycle.initAgentPipeline(baseOptions())
    expect(addInterceptor).toHaveBeenCalledTimes(5)

    lifecycle.disposeAgent()
  })

  it('wx.onAppRoute 与 DevTools 全局钩子也只挂载一轮', async () => {
    const onAppRoute = vi.fn()
    const hookOn = vi.fn()
    ;(globalThis as any).wx = { onAppRoute }
    ;(globalThis as any).__VUE_DEVTOOLS_GLOBAL_HOOK__ = { on: hookOn }

    const lifecycle = await freshLifecycle()

    lifecycle.initAgentPipeline(baseOptions())
    expect(onAppRoute).toHaveBeenCalledTimes(1)
    expect(hookOn.mock.calls.map((call) => call[0])).toEqual([
      'component:added',
      'component:updated',
      'component:removed',
    ])

    lifecycle.disposeAgent()
    lifecycle.initAgentPipeline(baseOptions())
    expect(onAppRoute).toHaveBeenCalledTimes(1)
    expect(hookOn).toHaveBeenCalledTimes(3)

    lifecycle.disposeAgent()
    delete (globalThis as any).__VUE_DEVTOOLS_GLOBAL_HOOK__
  })
})
