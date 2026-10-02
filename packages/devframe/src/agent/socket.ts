/**
 * UniSocketChannel: 适配 uni.connectSocket 为 birpc ChannelOptions
 * （浏览器全局禁用由 eslint no-restricted-globals 执法）
 */

import { structuredCloneParse } from 'devframe/utils/structured-clone'

// devframe wire codec 的 structured-clone 帧前缀（wire-codec 源码常量）。
// 不从 'devframe/rpc' 导入：该入口会拖入 ohash → node:crypto 链，小程序构建不兼容。
const STRUCTURED_CLONE_PREFIX = 's:'

/**
 * devframe wire codec（wire-codec）：入站帧可能是严格 JSON 或
 * `s:` 前缀的 structured-clone 编码（探针函数不在服务端 definitions
 * 注册表内时，node 侧发起的请求帧会走 s: 编码），此处统一解码。
 * 出站保持纯 JSON —— 服务端 deserialize 两种都接受。
 */
function decodeWireFrame(raw: unknown): any {
  if (typeof raw !== 'string')
    return raw
  if (raw.startsWith(STRUCTURED_CLONE_PREFIX))
    return structuredCloneParse(raw.slice(STRUCTURED_CLONE_PREFIX.length))
  try {
    return JSON.parse(raw)
  }
  catch {
    return undefined
  }
}

export interface BirpcChannel {
  post: (data: any, ...extra: any[]) => void | Promise<void>
  on: (fn: (data: any) => void) => void
}

export interface UniSocketChannelOptions {
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

// 兼容全局 uni 对象（小程序或 mock）
declare const uni: any

function resolveUni(): any {
  if (typeof uni !== 'undefined') {
    return uni
  }
  return (globalThis as any).uni
}

export function createUniSocketChannel(
  optionsOrUrl: string | UniSocketChannelOptions,
): UniSocketChannelHandle {
  const options: UniSocketChannelOptions = typeof optionsOrUrl === 'string'
    ? { wsUrl: optionsOrUrl }
    : optionsOrUrl

  const {
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
    if (isDisposed)
      return

    const uniObj = resolveUni()
    if (!uniObj || typeof uniObj.connectSocket !== 'function') {
      return
    }

    try {
      socketTask = uniObj.connectSocket({
        url: wsUrl,
        protocols,
        success: () => {},
        fail: (err: any) => {
          handleDisconnect(err)
        },
      })
    }
    catch (err) {
      handleDisconnect(err)
      return
    }

    if (socketTask && typeof socketTask.onOpen === 'function') {
      socketTask.onOpen(() => {
        handleOpen()
      })
      socketTask.onMessage((res: any) => {
        if (messageHandler) {
          const decoded = decodeWireFrame(res.data)
          if (decoded !== undefined) {
            messageHandler(decoded)
          }
        }
      })
      socketTask.onError((err: any) => {
        if (onError)
          onError(err)
        handleDisconnect(err)
      })
      socketTask.onClose((res: any) => {
        if (onClose)
          onClose(res)
        handleDisconnect(res)
      })
    }
    else if (uniObj.onSocketOpen) {
      uniObj.onSocketOpen(() => {
        handleOpen()
      })
      uniObj.onSocketMessage((res: any) => {
        if (messageHandler) {
          const decoded = decodeWireFrame(res.data)
          if (decoded !== undefined) {
            messageHandler(decoded)
          }
        }
      })
      uniObj.onSocketError((err: any) => {
        if (onError)
          onError(err)
        handleDisconnect(err)
      })
      uniObj.onSocketClose((res: any) => {
        if (onClose)
          onClose(res)
        handleDisconnect(res)
      })
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
    const rawData = typeof data === 'string' ? data : JSON.stringify(data)
    if (socketTask && typeof socketTask.send === 'function') {
      socketTask.send({
        data: rawData,
        fail: (err: any) => {
          sendQueue.unshift(rawData)
          handleDisconnect(err)
        },
      })
    }
    else {
      const uniObj = resolveUni()
      if (uniObj?.sendSocketMessage) {
        uniObj.sendSocketMessage({
          data: rawData,
          fail: (err: any) => {
            sendQueue.unshift(rawData)
            handleDisconnect(err)
          },
        })
      }
    }
  }

  function handleDisconnect(_reason?: any) {
    isOpen = false
    if (isDisposed)
      return

    if (!reconnectTimer) {
      reconnectAttempt++
      if (onReconnect) {
        onReconnect(reconnectAttempt)
      }
      const backoff = Math.min(initialBackoffMs * 1.5 ** (reconnectAttempt - 1), maxBackoffMs)
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
      if (isDisposed)
        return
      if (isOpen) {
        doSend(data)
      }
      else {
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
        socketTask.close({})
      }
      catch {}
    }
    else {
      const uniObj = resolveUni()
      if (uniObj?.closeSocket) {
        try {
          uniObj.closeSocket({})
        }
        catch {}
      }
    }
  }

  return {
    channel,
    dispose,
    isConnected: () => isOpen,
  }
}
