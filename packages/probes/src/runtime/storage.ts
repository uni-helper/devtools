/**
 * 探针侧 Storage 收集能力（agent/storage.ts）
 *
 * 实现微信小程序 Storage 元数据查询与键值按需拉取（STORAGE_DESIGN.md §3.1/§4.1/§6.1），
 * 并包装 uni 层写操作（set/remove/clear 及 Sync 变体）向 node 侧发送缓存失效通知。
 *
 * 约束与纪律：
 * - 探针禁浏览器 API（禁用 Blob / TextEncoder，手写 UTF-8 字节长计算）
 * - 包装完全透传原调用语义（回调式浅拷贝注入、Promise 式原样透传返回值与 this）
 * - 按需拉取，单条错误隔离（单个 key 失败不影响全集）
 * - 全程 try/catch 防御，插桩任何异常不得影响小程序宿主
 */

import { NODE_RPC } from '@uni-helper/devtools-shared'
import type {
  GetStorageEntriesParams,
  StorageEntriesResult,
  StorageEntry,
  StorageInfoResult,
} from '@uni-helper/devtools-shared'
import { resolveRuntimeUni } from './rpc-base.ts'

const INTERCEPTED_FLAG = '__uni_devtools_storage_intercepted__'

/**
 * Storage 能力抽象（预留未来多平台扩展：支付宝 my / 字节 tt / Web 等）
 */
export interface StorageCapability {
  getInfo(): Promise<StorageInfoResult>
  getEntries(params?: GetStorageEntriesParams): Promise<StorageEntriesResult>
}

export interface StorageDeps {
  getUni?: () => any
  getActiveInstance?: () => {
    rpc: any
    socketHandle?: { isConnected: () => boolean }
  } | null
}

let storageDeps: StorageDeps | null = null

/**
 * 手写 UTF-8 字节长计算：小程序运行时没有 Blob / TextEncoder 可用
 * （探针同时被禁浏览器 API），位运算覆盖 1~4 字节编码（含代理对）。
 */
export function getUtf8ByteLength(str: string): number {
  let bytes = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code <= 0x7f) {
      bytes += 1
    } else if (code <= 0x7ff) {
      bytes += 2
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // UTF-16 代理对（Surrogate pair）
      if (i + 1 < str.length) {
        const nextCode = str.charCodeAt(i + 1)
        if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
          bytes += 4
          i++
          continue
        }
      }
      bytes += 3
    } else {
      bytes += 3
    }
  }
  return bytes
}

/**
 * 按设计稿 §4.1 契约导出的安全序列化校验；探针内部取值路径未使用
 * （fetchEntry 自行序列化并做错误隔离），删除前先确认无外部消费方。
 */
export function safeSerialize(value: any): any {
  try {
    JSON.stringify(value)
    return value
  } catch {
    return '[Unserializable]'
  }
}

export class WechatStorageCapability implements StorageCapability {
  private uni: any

  constructor(uniInstance?: any) {
    this.uni = uniInstance || resolveRuntimeUni()
    if (!this.uni) {
      throw new Error('uni runtime is not available')
    }
  }

  async getInfo(): Promise<StorageInfoResult> {
    return new Promise((resolve, reject) => {
      try {
        this.uni.getStorageInfo({
          success: (res: any) => {
            const keys = Array.isArray(res?.keys) ? res.keys : []
            const currentSize =
              typeof res?.currentSize === 'number' ? res.currentSize : 0
            const limitSize =
              typeof res?.limitSize === 'number' ? res.limitSize : 10240
            resolve({
              keys,
              currentSize,
              limitSize,
              keyCount: keys.length,
              timestamp: Date.now(),
            })
          },
          fail: (err: any) => {
            reject(
              err instanceof Error
                ? err
                : new Error(err?.errMsg || 'Failed to get storage info'),
            )
          },
        })
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  async getEntries(
    params: GetStorageEntriesParams = {},
  ): Promise<StorageEntriesResult> {
    let effectiveParams = params
    if (typeof params === 'string') {
      try {
        effectiveParams = JSON.parse(params)
      } catch {
        effectiveParams = {}
      }
    }

    const info = await this.getInfo()
    const storageKeys = info.keys || []
    const storageKeySet = new Set(storageKeys)

    let targetKeys: string[]

    if (
      Array.isArray(effectiveParams.keys) &&
      effectiveParams.keys.length > 0
    ) {
      // 请求里不存在的 key 保留为显式 miss 条目而非静默丢弃：对 agent 调试，
      // 「查了但没查到」必须可见（行为测试锁定）
      targetKeys = Array.from(new Set(effectiveParams.keys.map(String)))
    } else if (effectiveParams.matchPattern) {
      let regex: RegExp
      try {
        regex = new RegExp(effectiveParams.matchPattern)
      } catch (err: any) {
        throw new Error(
          `Invalid matchPattern "${effectiveParams.matchPattern}": ${err?.message || err}`,
        )
      }
      targetKeys = storageKeys.filter((k) => regex.test(k))
    } else {
      targetKeys = storageKeys.slice()
    }

    const total = targetKeys.length

    let offset =
      effectiveParams.offset !== undefined ? Number(effectiveParams.offset) : 0
    if (Number.isNaN(offset) || offset < 0) {
      offset = 0
    }

    let limit =
      effectiveParams.limit !== undefined ? Number(effectiveParams.limit) : 50
    if (Number.isNaN(limit) || limit <= 0) {
      limit = 50
    }
    if (limit > 200) {
      limit = 200
    }

    const pagedKeys = targetKeys.slice(offset, offset + limit)
    const hasMore = offset + limit < total

    const maxValueChars =
      typeof effectiveParams.maxValueChars === 'number' &&
      effectiveParams.maxValueChars > 0
        ? effectiveParams.maxValueChars
        : 32768
    const includeSize = Boolean(effectiveParams.includeSize)

    const entries = await Promise.all(
      pagedKeys.map((key) => {
        if (!storageKeySet.has(key)) {
          return Promise.resolve<StorageEntry>({
            key,
            value: null,
            error: 'key not found',
          })
        }
        return this.fetchEntry(key, maxValueChars, includeSize)
      }),
    )

    return {
      entries,
      total,
      hasMore,
      timestamp: Date.now(),
    }
  }

  /**
   * 单条 Storage 键值拉取与错误隔离
   */
  private fetchEntry(
    key: string,
    maxValueChars: number,
    includeSize: boolean,
  ): Promise<StorageEntry> {
    return new Promise((resolve) => {
      try {
        this.uni.getStorage({
          key,
          success: (res: any) => {
            try {
              const rawData = res?.data
              let serialized: string
              try {
                serialized = JSON.stringify(rawData)
              } catch (err: any) {
                resolve({
                  key,
                  value: null,
                  error: err?.message || 'Unserializable value',
                })
                return
              }

              if (serialized === undefined) {
                resolve({
                  key,
                  value: null,
                  error: 'Unserializable value (undefined)',
                })
                return
              }

              let value = rawData
              let truncated = false

              if (serialized.length > maxValueChars) {
                value = serialized.slice(0, maxValueChars)
                truncated = true
              }

              const entry: StorageEntry = {
                key,
                value,
              }

              if (truncated) {
                entry.truncated = true
              }

              if (includeSize) {
                entry.size = getUtf8ByteLength(serialized)
              }

              resolve(entry)
            } catch (err: any) {
              resolve({
                key,
                value: null,
                error: err?.message || 'Failed to process storage entry',
              })
            }
          },
          fail: (err: any) => {
            resolve({
              key,
              value: null,
              error:
                err?.errMsg ||
                err?.message ||
                String(err) ||
                'Failed to get storage',
            })
          },
        })
      } catch (err: any) {
        resolve({
          key,
          value: null,
          error: err?.message || String(err) || 'Failed to call getStorage',
        })
      }
    })
  }
}

export function createStorageCapability(): StorageCapability {
  return new WechatStorageCapability()
}

/**
 * 写失效通知是尽力而为的缓存优化：fire-and-forget，未连接或失败静默吞掉——
 * 调试插桩绝不能阻塞或打断业务写路径。
 */
function notifyStorageChanged(): void {
  try {
    const instance = storageDeps?.getActiveInstance?.()
    if (!instance || !instance.rpc) {
      return
    }
    if (
      instance.socketHandle &&
      typeof instance.socketHandle.isConnected === 'function' &&
      !instance.socketHandle.isConnected()
    ) {
      return
    }
    const callPromise = instance.rpc.$call(NODE_RPC.notifyStorageChanged, {
      timestamp: Date.now(),
    })
    if (callPromise && typeof callPromise.catch === 'function') {
      callPromise.catch(() => {})
    }
  } catch {}
}

function wrapAsyncStorageMethod(orig: Function): Function {
  return function (this: any, options?: any, ...rest: any[]) {
    const hasCallbacks =
      options &&
      typeof options === 'object' &&
      (typeof options.success === 'function' ||
        typeof options.fail === 'function' ||
        typeof options.complete === 'function')

    if (hasCallbacks) {
      const wrappedOptions = { ...options }
      let successHandled = false

      wrappedOptions.success = function (this: any, ...args: any[]) {
        try {
          if (!successHandled) {
            successHandled = true
            notifyStorageChanged()
          }
        } catch {}
        if (typeof options.success === 'function') {
          return options.success.apply(this, args)
        }
      }

      wrappedOptions.fail = function (this: any, ...args: any[]) {
        if (typeof options.fail === 'function') {
          return options.fail.apply(this, args)
        }
      }

      wrappedOptions.complete = function (this: any, ...args: any[]) {
        if (typeof options.complete === 'function') {
          return options.complete.apply(this, args)
        }
      }

      return orig.call(this, wrappedOptions, ...rest)
    }

    const result = orig.call(this, options, ...rest)
    if (result && typeof result.then === 'function') {
      result.then(
        () => {
          try {
            notifyStorageChanged()
          } catch {}
        },
        () => {},
      )
    } else {
      try {
        notifyStorageChanged()
      } catch {}
    }
    return result
  }
}

function wrapSyncStorageMethod(orig: Function): Function {
  return function (this: any, ...args: any[]) {
    const result = orig.apply(this, args)
    try {
      notifyStorageChanged()
    } catch {}
    return result
  }
}

/**
 * 安装 Storage 写操作拦截器（set/remove/clear 及三个 Sync 变体）：
 * 包装完全透传原语义（回调、返回值、this 均不变），仅在写成功后追加失效通知。
 */
export function installStorageWriteInterceptors(deps?: StorageDeps): void {
  if (deps) {
    storageDeps = deps
  }
  const uniObj = deps?.getUni?.() || resolveRuntimeUni()
  if (!uniObj) {
    console.warn(
      '[uni-devtools:storage] uni runtime not found, storage interceptors not installed',
    )
    return
  }

  const asyncMethods = ['setStorage', 'removeStorage', 'clearStorage'] as const
  const syncMethods = [
    'setStorageSync',
    'removeStorageSync',
    'clearStorageSync',
  ] as const

  for (const name of asyncMethods) {
    const orig = uniObj[name]
    if (typeof orig === 'function') {
      if (!orig[INTERCEPTED_FLAG]) {
        uniObj[name] = wrapAsyncStorageMethod(orig)
        uniObj[name][INTERCEPTED_FLAG] = true
      }
    } else {
      console.warn(
        `[uni-devtools:storage] ${name} is not a function on uni, skipping`,
      )
    }
  }

  for (const name of syncMethods) {
    const orig = uniObj[name]
    if (typeof orig === 'function') {
      if (!orig[INTERCEPTED_FLAG]) {
        uniObj[name] = wrapSyncStorageMethod(orig)
        uniObj[name][INTERCEPTED_FLAG] = true
      }
    } else {
      console.warn(
        `[uni-devtools:storage] ${name} is not a function on uni, skipping`,
      )
    }
  }
}

export function __resetStorageForTest(): void {
  storageDeps = null
}
