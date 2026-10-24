/**
 * UniSocketChannel: 适配 uni.connectSocket 为 birpc ChannelOptions
 * （浏览器全局禁用由 eslint no-restricted-globals 执法）
 */

import { AGENT_UNAUTHORIZED_CLOSE_CODE } from '@uni-helper/devtools-shared'
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

/**
 * 未连上时最多缓存的出站帧数。node 不在线时探针仍会产生推送与 RPC 应答，
 * 无上限缓存会在长时间离线后堆积内存，且重连时一次性冲刷大量过期帧。
 */
export const MAX_PENDING_FRAMES = 100

/**
 * 连续重连失败的上限（按默认退避约 40s）。足够跨过网络抖动、真机切后台等短暂断线；
 * node 服务关掉后不再无休止地重连——服务重启会换新 token 并重新编译小程序，
 * 旧探针即使连回去也过不了鉴权。
 */
export const MAX_RECONNECT_ATTEMPTS = 10

export interface BirpcChannel {
  post: (data: any, ...extra: any[]) => void | Promise<void>
  on: (fn: (data: any) => void) => void
}

export interface UniSocketChannelOptions {
  /** 运行时适配器（必需） */
  adapter: RuntimeAdapter
  wsUrl: string
  maxBackoffMs?: number
  initialBackoffMs?: number
  /** 连续重连失败多少次后放弃；期间连上过一次即重新计数 */
  maxReconnectAttempts?: number
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
    maxBackoffMs = 5000,
    initialBackoffMs = 1000,
    maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS,
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

    let socket: ReturnType<RuntimeAdapter['connectSocket']>
    try {
      socket = adapter.connectSocket(wsUrl)
    } catch (err) {
      console.error('[uni-devtools-agent] connectSocket throw:', err)
      handleDisconnect(err)
      return
    }
    socketTask = socket
    // 只处理当前连接的事件：旧连接被替换后迟到的 close/error 不能把新连接标成断开
    const isCurrent = () => socketTask === socket

    socket.onOpen(() => {
      if (isCurrent()) handleOpen()
    })

    socket.onMessage((data: string) => {
      if (isCurrent() && messageHandler) messageHandler(decodeWireFrame(data))
    })

    socket.onError((err: any) => {
      if (!isCurrent()) return
      if (onError) onError(err)
      handleDisconnect(err)
    })

    socket.onClose((code?: number, reason?: string) => {
      if (!isCurrent()) return
      if (onClose) onClose({ code, reason })
      if (code === AGENT_UNAUTHORIZED_CLOSE_CODE) {
        // 连接能建立，所以重连计数每次都会清零；不在这里停下就会无限「连上即被踢」
        console.warn(
          '[uni-devtools-agent] DevTools 服务已重启，本探针的 token 已失效，停止重连；重新编译小程序即可恢复',
        )
        isOpen = false
        releaseSocket()
        return
      }
      handleDisconnect({ code, reason })
    })
  }

  function handleOpen() {
    isOpen = true
    reconnectAttempt = 0
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    // 冲刷中途发送失败会断开连接（isOpen 置 false），剩余帧留待下次重连
    while (isOpen && sendQueue.length > 0) {
      const pendingData = sendQueue.shift()
      if (pendingData !== undefined) {
        doSend(pendingData)
      }
    }

    if (onOpen) {
      onOpen()
    }
  }

  function enqueue(data: any) {
    sendQueue.push(data)
    if (sendQueue.length > MAX_PENDING_FRAMES)
      sendQueue.splice(0, sendQueue.length - MAX_PENDING_FRAMES)
  }

  function doSend(data: any) {
    const rawData =
      typeof data === 'string' ? data : JSON.stringify(data, wireReplacer)
    if (!socketTask || typeof socketTask.send !== 'function') {
      enqueue(rawData)
      return
    }
    try {
      socketTask.send(rawData)
    } catch (err) {
      console.error('[uni-devtools-agent] socket.send failed:', err)
      sendQueue.unshift(rawData)
      handleDisconnect(err)
    }
  }

  /** 关闭并丢弃当前连接（出错后不关，小程序侧同时打开的 socket 数有上限，会挤占业务连接） */
  function releaseSocket() {
    const socket = socketTask
    socketTask = null
    if (socket && typeof socket.close === 'function') {
      try {
        socket.close()
      } catch {}
    }
  }

  function handleDisconnect(_reason?: any) {
    isOpen = false
    releaseSocket()
    if (isDisposed || reconnectTimer) return

    // 日志只在断线与放弃时各打一次：按次打印会在服务关掉后持续刷屏
    const endpoint = wsUrl.split('?')[0]
    if (reconnectAttempt >= maxReconnectAttempts) {
      console.warn(
        `[uni-devtools-agent] 连续 ${reconnectAttempt} 次连不上 DevTools 服务（${endpoint}），已停止重连`,
      )
      return
    }
    if (reconnectAttempt === 0)
      console.warn(
        `[uni-devtools-agent] 连不上 DevTools 服务（${endpoint}），正在重连`,
      )

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

  // 初始连接
  connect()

  const channel: BirpcChannel = {
    post: (data: any) => {
      if (isDisposed) return
      if (isOpen) {
        doSend(data)
      } else {
        // 未 open 时缓存，避免丢消息（有上限，超出丢最旧的）
        enqueue(data)
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
    releaseSocket()
  }

  return {
    channel,
    dispose,
    isConnected: () => isOpen,
  }
}
