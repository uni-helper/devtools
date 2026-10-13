import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeAdapter } from '../src/adapter/types.ts'
import { NullAdapter } from '../src/adapter/types.ts'
import {
  MAX_PENDING_FRAMES,
  createUniSocketChannel,
} from '../src/socket/index.ts'

/** 可控的假 SocketTask：记录发送与关闭，事件由测试手动触发 */
function createFakeSocket() {
  const record = {
    sent: [] as string[],
    closed: 0,
    handlers: {} as Record<string, ((...args: any[]) => void) | undefined>,
  }
  const task = {
    onOpen: (fn: () => void) => {
      record.handlers.open = fn
    },
    onMessage: (fn: (data: string) => void) => {
      record.handlers.message = fn
    },
    onError: (fn: (err: any) => void) => {
      record.handlers.error = fn
    },
    onClose: (fn: (code?: number, reason?: string) => void) => {
      record.handlers.close = fn
    },
    send: (data: string) => {
      record.sent.push(data)
    },
    close: () => {
      record.closed++
    },
  }
  return { record, task }
}

/** 每次 connectSocket 都新建一个假 socket，按创建顺序留档 */
function createHost() {
  const sockets: Array<ReturnType<typeof createFakeSocket>['record']> = []
  const adapter: RuntimeAdapter = Object.assign(new NullAdapter(), {
    connectSocket: () => {
      const { record, task } = createFakeSocket()
      sockets.push(record)
      return task
    },
  })
  return { adapter, sockets }
}

describe('探针 socket 通道', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('探针抛出的 Error 被摊平成 { name, message }，文案能穿到 node 侧', () => {
    const host = createHost()
    const handle = createUniSocketChannel({
      adapter: host.adapter,
      wsUrl: 'ws://test/agent',
    })
    host.sockets[0]!.handlers.open?.()

    handle.channel.post({ t: 's', i: 1, e: new Error('组件不在注册表里') })

    expect(JSON.parse(host.sockets[0]!.sent[0]!)).toEqual({
      t: 's',
      i: 1,
      e: { name: 'Error', message: '组件不在注册表里' },
    })
    handle.dispose()
  })

  it('普通载荷原样发出', () => {
    const host = createHost()
    const handle = createUniSocketChannel({
      adapter: host.adapter,
      wsUrl: 'ws://test/agent',
    })
    host.sockets[0]!.handlers.open?.()

    handle.channel.post({ t: 's', i: 2, r: { pages: [{ id: '1' }], ok: true } })

    expect(JSON.parse(host.sockets[0]!.sent[0]!)).toEqual({
      t: 's',
      i: 2,
      r: { pages: [{ id: '1' }], ok: true },
    })
    handle.dispose()
  })

  it('连接出错后先关闭旧 socket 再重连，不泄漏连接', () => {
    const host = createHost()
    const handle = createUniSocketChannel({
      adapter: host.adapter,
      wsUrl: 'ws://test/agent',
      initialBackoffMs: 100,
    })
    host.sockets[0]!.handlers.open?.()

    host.sockets[0]!.handlers.error?.(new Error('boom'))

    expect(host.sockets[0]!.closed).toBe(1)
    vi.advanceTimersByTime(100)
    expect(host.sockets).toHaveLength(2)
    handle.dispose()
  })

  it('旧 socket 迟到的 close 事件不会把新连接标成断开', () => {
    const host = createHost()
    const handle = createUniSocketChannel({
      adapter: host.adapter,
      wsUrl: 'ws://test/agent',
      initialBackoffMs: 100,
    })
    host.sockets[0]!.handlers.error?.(new Error('boom'))
    vi.advanceTimersByTime(100)
    host.sockets[1]!.handlers.open?.()
    expect(handle.isConnected()).toBe(true)

    host.sockets[0]!.handlers.close?.(1006, 'late')

    expect(handle.isConnected()).toBe(true)
    expect(host.sockets).toHaveLength(2)
    handle.dispose()
  })

  it('离线期间的出站帧有上限，只保留最新的部分，连上后按序补发', () => {
    const host = createHost()
    const handle = createUniSocketChannel({
      adapter: host.adapter,
      wsUrl: 'ws://test/agent',
    })

    for (let i = 0; i < MAX_PENDING_FRAMES + 20; i++) handle.channel.post({ i })
    host.sockets[0]!.handlers.open?.()

    const sent = host.sockets[0]!.sent.map((raw) => JSON.parse(raw).i)
    expect(sent).toHaveLength(MAX_PENDING_FRAMES)
    expect(sent[0]).toBe(20)
    expect(sent.at(-1)).toBe(MAX_PENDING_FRAMES + 19)
    handle.dispose()
  })
})
