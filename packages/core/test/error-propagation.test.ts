import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentRegistry } from '../src/relay.ts'
import { createUniSocketChannel } from '@uni-helper/devtools-probes/socket'

/**
 * 探针错误穿越 WebSocket 的链路。
 *
 * 背景：`Error` 的 message 是不可枚举属性，`JSON.stringify(new Error('x'))` 得到 `{}`。
 * 探针抛的错若原样走 JSON 出口，到 relay 只剩空对象，调用方只能看到 `[object Object]`——
 * 排查时完全瞎。这一组测试锁住「探针摊平 → relay 认得出」这两端。
 */

function createUniHost() {
  const sent: string[] = []
  const handlers: Record<string, ((res: any) => void) | undefined> = {}

  const socketTask = {
    onOpen: (fn: (res: any) => void) => { handlers.open = fn },
    onMessage: (fn: (res: any) => void) => { handlers.message = fn },
    onError: (fn: (res: any) => void) => { handlers.error = fn },
    onClose: (fn: (res: any) => void) => { handlers.close = fn },
    send: (opts: { data: string }) => { sent.push(opts.data) },
    close: () => {},
  }

  return {
    uni: { connectSocket: vi.fn(() => socketTask) },
    sent,
    handlers,
  }
}

describe('探针出站：Error 摊平', () => {
  afterEach(() => {
    delete (globalThis as any).uni
    vi.restoreAllMocks()
  })

  it('error 被序列化成 { name, message }，文案不丢', () => {
    const host = createUniHost()
    ;(globalThis as any).uni = host.uni
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const handle = createUniSocketChannel({ wsUrl: 'ws://test/agent' })
    host.handlers.open?.({})

    handle.channel.post({ t: 's', i: 1, e: new Error('组件不在注册表里') })

    expect(host.sent).toHaveLength(1)
    expect(JSON.parse(host.sent[0]!)).toEqual({
      t: 's',
      i: 1,
      e: { name: 'Error', message: '组件不在注册表里' },
    })

    handle.dispose()
  })

  it('普通载荷不受影响（错误分支之外零改动）', () => {
    const host = createUniHost()
    ;(globalThis as any).uni = host.uni
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const handle = createUniSocketChannel({ wsUrl: 'ws://test/agent' })
    host.handlers.open?.({})

    handle.channel.post({ t: 's', i: 2, r: { pages: [{ id: '1' }], n: 42, ok: true } })

    expect(JSON.parse(host.sent[0]!)).toEqual({
      t: 's',
      i: 2,
      r: { pages: [{ id: '1' }], n: 42, ok: true },
    })

    handle.dispose()
  })
})

describe('relay 出站：跨进程错误文案还原', () => {
  function registryWith(client: { $call: (method: string, ...args: any[]) => Promise<any> }) {
    const registry = new AgentRegistry({ timeout: 200 })
    registry.bind({ clients: [client] } as any)
    return registry
  }

  it('error 实例：透出 message', async () => {
    const registry = registryWith({
      $call: (method) => {
        if (method === 'uni-devtools:agent:ping')
          return Promise.resolve(Date.now())
        return Promise.reject(new Error('Component with id "x" not found in registry'))
      },
    })

    await expect(registry.callAgent('uni-devtools:agent:updateComponentState', {}))
      .rejects
      .toThrow(/Component with id "x" not found in registry/)
  })

  it('摊平后的普通对象：认 .message，不退化成 [object Object]', async () => {
    const registry = registryWith({
      $call: (method) => {
        if (method === 'uni-devtools:agent:ping')
          return Promise.resolve(Date.now())
        // 探针经 JSON 出口后的形态
        return Promise.reject(new Error('[updateComponentState] Path "payload" is not navigable'))
      },
    })

    await expect(registry.callAgent('uni-devtools:agent:updateComponentState', {}))
      .rejects
      .toThrow(/Path "payload" is not navigable/)
  })

  it('确实没有 agent 时，保留原本的「未连接」文案', async () => {
    const registry = registryWith({
      $call: () => Promise.reject(new Error('socket closed')),
    })

    await expect(registry.callAgent('uni-devtools:agent:ping'))
      .rejects
      .toThrow(/No uni-devtools agent connected/)
  })
})
