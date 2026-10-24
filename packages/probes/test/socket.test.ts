import { AGENT_UNAUTHORIZED_CLOSE_CODE } from '@uni-helper/devtools-shared'
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

  it('node 服务一直连不上时，重连到上限就停止，不再新建连接', () => {
    const host = createHost()
    const handle = createUniSocketChannel({
      adapter: host.adapter,
      wsUrl: 'ws://test/agent',
      initialBackoffMs: 100,
      maxBackoffMs: 100,
      maxReconnectAttempts: 3,
    })

    for (let i = 0; i < 10; i++) {
      host.sockets.at(-1)!.handlers.error?.({ errMsg: 'connectSocket:fail' })
      vi.advanceTimersByTime(100)
    }
    vi.advanceTimersByTime(60_000)

    // 首连 1 次 + 重连 3 次
    expect(host.sockets).toHaveLength(4)
    expect(handle.isConnected()).toBe(false)
    handle.dispose()
  })

  it('重连途中连上过一次，重连次数重新计算', () => {
    const host = createHost()
    const handle = createUniSocketChannel({
      adapter: host.adapter,
      wsUrl: 'ws://test/agent',
      initialBackoffMs: 100,
      maxBackoffMs: 100,
      maxReconnectAttempts: 2,
    })
    const failLatest = () => {
      host.sockets.at(-1)!.handlers.error?.({ errMsg: 'connectSocket:fail' })
      vi.advanceTimersByTime(100)
    }

    failLatest()
    failLatest()
    host.sockets.at(-1)!.handlers.open?.()
    failLatest()
    failLatest()
    failLatest()

    // 首连 + 2 次重连（第 2 次连上）+ 断开后再 2 次重连
    expect(host.sockets).toHaveLength(5)
    handle.dispose()
  })

  it('断线与放弃重连各提示一次，不随重连次数刷屏', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const host = createHost()
    const handle = createUniSocketChannel({
      adapter: host.adapter,
      wsUrl: 'ws://test/agent',
      initialBackoffMs: 100,
      maxBackoffMs: 100,
      maxReconnectAttempts: 5,
    })
    host.sockets[0]!.handlers.open?.()

    for (let i = 0; i < 10; i++) {
      host.sockets.at(-1)!.handlers.error?.({ errMsg: 'connectSocket:fail' })
      vi.advanceTimersByTime(100)
    }

    expect(error).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(2)
    expect(String(warn.mock.calls[1]![0])).toContain('停止重连')
    handle.dispose()
  })

  it('node 服务以「token 已失效」关闭连接时立即停止重连，并提示重新编译', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const host = createHost()
    const handle = createUniSocketChannel({
      adapter: host.adapter,
      wsUrl: 'ws://test/agent',
      initialBackoffMs: 100,
    })
    host.sockets[0]!.handlers.open?.()

    host.sockets[0]!.handlers.close?.(
      AGENT_UNAUTHORIZED_CLOSE_CODE,
      'stale devtools token',
    )
    vi.advanceTimersByTime(60_000)

    expect(host.sockets).toHaveLength(1)
    expect(handle.isConnected()).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('重新编译')
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
