/**
 * Storage 收集（node 侧）：元数据短 TTL 缓存 + devframe handler 工厂。
 *
 * 与探针的分工（STORAGE_DESIGN.md §4.2/§5.1）：
 * - 只有**元数据**（keys 列表 + 容量）走缓存——高频 MCP 查询不反复穿越 WS；
 *   TTL 2 秒兜底脏读，探针写操作通知（NODE_RPC.notifyStorageChanged）到达即作废。
 * - 键值内容**永不缓存**，每次实时透传探针，保证读取的是最新值。
 * - 探针查询失败不缓存失败结果，下次查询照常重试。
 *
 * handler 做成工厂（而非闭包在 devframe.ts 里）是为了让缓存行为可被行为测试
 * 直接观测；devframe.ts 只做参数透传的薄接线。`callAgent` 以结构类型注入，
 * AgentRegistry 天然满足。
 */

import { AGENT_RPC } from './rpc-names.ts'
import type {
  GetStorageEntriesParams,
  NotifyStorageChangedParams,
  NotifyStorageChangedResult,
  StorageEntriesResult,
  StorageInfoResult,
} from '@uni-helper/devtools-shared'

/** devframe.ts 传入的 registry 的最小结构面（只用到 callAgent）。
 * 非泛型签名：泛型方法会让测试假件（vi.fn 的具体返回类型）无法结构赋值；
 * `AgentRegistry['callAgent']` 的泛型签名天然满足本接口，wire 类型由工厂内收窄。 */
export interface CallAgentLike {
  callAgent: (method: string, params?: unknown) => Promise<unknown>
}

export const STORAGE_INFO_CACHE_TTL_MS = 2000

interface CachedStorageInfo {
  data: StorageInfoResult
  expireAt: number
}

/**
 * 元数据缓存的防御性拷贝：keys 数组不与任何调用方共享，
 * 调用方原地 push/splice 不会污染缓存（行为测试锁定）。
 *
 * wire 边界校验：探针响应的 keys 必须是数组（STORAGE_DESIGN.md §7.4「Core 层
 * 二次验证数据结构」），畸形响应显式报错且不入缓存——静默归一成空列表会掩盖
 * 探针版本错配，对调试工具是脏行为。
 */
function cloneStorageInfo(data: StorageInfoResult): StorageInfoResult {
  if (!data || !Array.isArray(data.keys)) {
    throw new Error(
      `Invalid storage info from probe: expected keys to be an array, got ${
        data ? typeof data.keys : typeof data
      }`,
    )
  }
  return { ...data, keys: [...data.keys] }
}

export class StorageInfoCache {
  private cache: CachedStorageInfo | null = null
  private readonly ttlMs: number

  constructor(ttlMs = STORAGE_INFO_CACHE_TTL_MS) {
    this.ttlMs = ttlMs
  }

  get(now = Date.now()): StorageInfoResult | null {
    if (!this.cache) return null
    if (now >= this.cache.expireAt) {
      this.cache = null
      return null
    }
    return cloneStorageInfo(this.cache.data)
  }

  set(data: StorageInfoResult, now = Date.now()): void {
    this.cache = {
      data: cloneStorageInfo(data),
      expireAt: now + this.ttlMs,
    }
  }

  invalidate(): void {
    this.cache = null
  }
}

/** devframe 全局共享一份（sidecar 单进程语义；测试用 invalidate() 复位） */
export const storageInfoCache = new StorageInfoCache()

/** 元数据查询 handler：命中缓存直接回，未命中穿探针并回填缓存 */
export function createGetStorageInfoHandler(deps: CallAgentLike) {
  return async (): Promise<StorageInfoResult> => {
    const cached = storageInfoCache.get()
    if (cached) return cached

    const result = (await deps.callAgent(
      AGENT_RPC.getStorageInfo,
    )) as StorageInfoResult
    storageInfoCache.set(result)
    return cloneStorageInfo(result)
  }
}

/** 键值查询 handler：透传参数与结果，不读不写缓存 */
export function createGetStorageEntriesHandler(deps: CallAgentLike) {
  return async (
    params?: GetStorageEntriesParams,
  ): Promise<StorageEntriesResult> => {
    return (await deps.callAgent(
      AGENT_RPC.getStorageEntries,
      params,
    )) as StorageEntriesResult
  }
}

/** 写操作通知 handler：到达即作废元数据缓存（TTL 兜底照旧），返回成功应答 */
export function createNotifyStorageChangedHandler() {
  return async (
    _params?: NotifyStorageChangedParams,
  ): Promise<NotifyStorageChangedResult> => {
    storageInfoCache.invalidate()
    return { ok: true }
  }
}
