/**
 * UniSocketChannel: 适配 uni.connectSocket 为 birpc ChannelOptions
 * （浏览器全局禁用由 eslint no-restricted-globals 执法）
 */

import { structuredCloneParse } from 'devframe/utils/structured-clone'
import type { RuntimeAdapter } from '../adapter/types.ts'

// devframe wire codec 的 structured-clone 帧前缀（wire-codec 源码常量）。
// 不从 'devframe/rpc' 导入：该入口会拖入 ohash → node:crypto 链，小程序构建不兼容。
const STRUCTURED_CLONE_PREFIX = 's:'

/**
 * Error 的 `message` / `stack` 不可枚举，`JSON.stringify(new Error('x'))` 得到 `{}`。
 * 探针抛的错若原样走 JSON 出口，到 relay 只剩空对象，调用方只能看到 `[object Object]`。
 * 这里显式摊平成可序列化对象，让错误文案能穿到面板。
 */
function wireReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error)
    return { name: value.name, message: value.message }
  return value
}

/**
 * devframe wire codec（wire-codec）：入站帧可能是严格 JSON 或
 * `s:` 前缀的 structured-clone 编码（探针函数不在服务端 definitions
 * 注册表内时，node 侧发起的请求帧会走 s: 编码），此处统一解码。
 * 出站保持纯 JSON —— 服务端 deserialize 两种都接受。
 */
function decodeWireFrame(raw: unknown): any {
  if (typeof raw !== 'string') return raw
  if (raw.startsWith(STRUCTURED_CLONE_PREFIX))
    return structuredCloneParse(raw.slice(STRUCTURED_CLONE_PREFIX.length))
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export interface BirpcChannel {
  post: (data: any, ...extra: any[]) => void | Promise<void>
  on: (fn: (data: any) => void) => void
}

export interface UniSocketChannelOptions {
  /** 运行时适配器（必需） */
  adapter: RuntimeAdapter
  wsUrl: string
  protocols?: string[]
  maxBackoffMs?: number
  initialBackoffMs?: number
  onOpen?: () => void
  onClose?: (res: any) => void
  onError?: (err: any) => void
  onReconnect?: (attempt: number) => void
}

export interface UniSocketChannelHandle {
  channel: BirpcChannel
  dispose: () => void
  isConnected: () => boolean
}

/**
 * 创建 WebSocket 通道（通过 adapter）
 *
 * 原则 P2 (Late Binding)：
 * - 不再直接访问 uni/wx/my/tt/swan 全局变量
 * - 通过 adapter.connectSocket 能力连接 WebSocket
 */
export function createUniSocketChannel(
  options: UniSocketChannelOptions,
): UniSocketChannelHandle {
  const {
    adapter,
    wsUrl,
    protocols,
    maxBackoffMs = 5000,
    initialBackoffMs = 1000,
    onOpen,
    onClose,
    onError,
    onReconnect,
  } = options

  let socketTask: any = null
  let isOpen = false
  let isDisposed = false
  let reconnectAttempt = 0
  let reconnectTimer: any = null
  let messageHandler: ((data: any) => void) | null = null
  const sendQueue: any[] = []

  function connect() {
    if (isDisposed) return

    try {
      // 通过 adapter 创建 WebSocket 连接
      const socket = adapter.connectSocket(wsUrl)
      socketTask = socket

      // 监听 open 事件（异步握手完成后触发）
      socket.onOpen(() => {
        handleOpen()
      })

      // 监听 message 事件
      socket.onMessage((data: string) => {
        if (messageHandler) {
          const decoded = decodeWireFrame(data)
          messageHandler(decoded)
        }
      })

      // 监听 error 事件
      socket.onError((err: any) => {
        console.error('[uni-devtools-agent] socket error:', err)
        if (onError) onError(err)
        handleDisconnect(err)
      })

      // 监听 close 事件
      socket.onClose((code?: number, reason?: string) => {
        if (onClose) onClose({ code, reason })
        handleDisconnect({ code, reason })
      })
    } catch (err) {
      console.error('[uni-devtools-agent] connectSocket throw:', err)
      handleDisconnect(err)
      return
    }
  }

  function handleOpen() {
    isOpen = true
    reconnectAttempt = 0
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    while (sendQueue.length > 0) {
      const pendingData = sendQueue.shift()
      if (pendingData !== undefined) {
        doSend(pendingData)
      }
    }

    if (onOpen) {
      onOpen()
    }
  }

  function doSend(data: any) {
    const rawData =
      typeof data === 'string' ? data : JSON.stringify(data, wireReplacer)
    if (socketTask && typeof socketTask.send === 'function') {
      try {
        socketTask.send(rawData)
      } catch (err) {
        console.error('[uni-devtools-agent] socket.send failed:', err)
        sendQueue.unshift(rawData)
        handleDisconnect(err)
      }
    }
  }

  function handleDisconnect(_reason?: any) {
    isOpen = false
    if (isDisposed) return

    if (!reconnectTimer) {
      reconnectAttempt++
      if (onReconnect) {
        onReconnect(reconnectAttempt)
      }
      const backoff = Math.min(
        initialBackoffMs * 1.5 ** (reconnectAttempt - 1),
        maxBackoffMs,
      )
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
      }, backoff)
    }
  }

  // 初始连接
  connect()

  const channel: BirpcChannel = {
    post: (data: any) => {
      if (isDisposed) return
      if (isOpen) {
        doSend(data)
      } else {
        // 未 open 时缓存，避免丢消息
        sendQueue.push(data)
      }
    },
    on: (fn: (data: any) => void) => {
      messageHandler = fn
    },
  }

  const dispose = () => {
    isDisposed = true
    isOpen = false
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    sendQueue.length = 0
    messageHandler = null
    if (socketTask && typeof socketTask.close === 'function') {
      try {
        socketTask.close()
      } catch {}
    }
  }

  return {
    channel,
    dispose,
    isConnected: () => isOpen,
  }
}
