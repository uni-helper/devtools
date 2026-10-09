import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  StorageInfoCache,
  createGetStorageEntriesHandler,
  createGetStorageInfoHandler,
  createNotifyStorageChangedHandler,
  storageInfoCache,
} from '../src/storage.ts'

/**
 * Storage 收集（core 侧）行为基线。
 *
 * 对应 STORAGE_DESIGN.md §3.1/§4.2/§9：node 侧只对**元数据**做短 TTL 缓存，
 * 键值内容永远实时透传探针；探针的写操作通知到达即作废缓存。
 * 用假 callAgent 观测「有没有真的去问探针」——缓存命中与否本身就是对 agent
 * 的交互契约，属于可断言的副作用约束。
 */

function makeRegistry(overrides?: {
  infoResult?: Partial<{
    keys: string[]
    currentSize: number
    limitSize: number
  }>
}) {
  const infoPayload = {
    keys: overrides?.infoResult?.keys ?? ['userToken', 'cart'],
    currentSize: overrides?.infoResult?.currentSize ?? 12,
    limitSize: overrides?.infoResult?.limitSize ?? 10240,
    keyCount: (overrides?.infoResult?.keys ?? ['userToken', 'cart']).length,
    timestamp: 1,
  }
  const callAgent = vi.fn(async (method: string) => {
    if (method === 'uni-devtools:agent:getStorageInfo') return infoPayload
    return { entries: [], total: 0, hasMore: false, timestamp: 2 }
  })
  return { callAgent }
}

describe('Storage 元数据缓存', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    storageInfoCache.invalidate()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('缓存有效期内重复查询容量元数据不打扰探针', async () => {
    const registry = makeRegistry()
    const handler = createGetStorageInfoHandler(registry)

    const first = await handler()
    vi.advanceTimersByTime(1500)
    const second = await handler()

    expect(registry.callAgent).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
  })

  it('缓存过期后重复查询重新拉取最新元数据', async () => {
    const registry = makeRegistry()
    const handler = createGetStorageInfoHandler(registry)

    await handler()
    vi.advanceTimersByTime(2500)
    await handler()

    expect(registry.callAgent).toHaveBeenCalledTimes(2)
  })

  it('探针写操作通知使缓存立即作废，下次查询重新拉取', async () => {
    const registry = makeRegistry()
    const handler = createGetStorageInfoHandler(registry)
    const notify = createNotifyStorageChangedHandler()

    await handler()
    await notify({ timestamp: Date.now() })
    await handler()

    expect(registry.callAgent).toHaveBeenCalledTimes(2)
  })

  it('探针查询失败不缓存失败结果，下次查询重试', async () => {
    const callAgent = vi.fn<[], Promise<unknown>>(async () => {
      throw new Error('No uni-devtools agent connected')
    })
    const handler = createGetStorageInfoHandler({ callAgent })

    await expect(handler()).rejects.toThrow('No uni-devtools agent connected')
    callAgent.mockImplementation(async () => ({
      keys: ['userToken'],
      currentSize: 1,
      limitSize: 10240,
      keyCount: 1,
      timestamp: 3,
    }))
    await expect(handler()).resolves.toMatchObject({ keys: ['userToken'] })
    expect(callAgent).toHaveBeenCalledTimes(2)
  })

  it('缓存命中返回副本，调用方修改不污染缓存', async () => {
    const registry = makeRegistry()
    const handler = createGetStorageInfoHandler(registry)

    const first = await handler()
    ;(first as any).keys.push('injected')
    const second = await handler()

    expect(second.keys).toEqual(['userToken', 'cart'])
  })

  it('探针返回畸形元数据时查询报错且不入缓存', async () => {
    const callAgent = vi.fn<[], Promise<unknown>>(async () => ({
      keys: undefined,
      currentSize: 1,
      limitSize: 10240,
      keyCount: 0,
      timestamp: 1,
    }))
    const handler = createGetStorageInfoHandler({ callAgent })

    await expect(handler()).rejects.toThrow(/keys/i)

    // 修复探针后同一 handler 查询立即重试（畸形结果未被缓存）
    callAgent.mockImplementation(async () => ({
      keys: ['ok'],
      currentSize: 1,
      limitSize: 10240,
      keyCount: 1,
      timestamp: 2,
    }))
    await expect(handler()).resolves.toMatchObject({ keys: ['ok'] })
    expect(callAgent).toHaveBeenCalledTimes(2)
  })
})

describe('Storage 键值查询', () => {
  it('键值查询每次都透传探针并返回最新结果（不缓存）', async () => {
    let entries = [{ key: 'userToken', value: 'a' }]
    const callAgent = vi.fn(async () => ({
      entries,
      total: entries.length,
      hasMore: false,
      timestamp: Date.now(),
    }))
    const handler = createGetStorageEntriesHandler({ callAgent })

    const first = await handler({ keys: ['userToken'] })
    entries = [{ key: 'userToken', value: 'refreshed' }]
    const second = await handler({ keys: ['userToken'] })

    expect(callAgent).toHaveBeenCalledTimes(2)
    expect(first.entries[0]).toMatchObject({ value: 'a' })
    expect(second.entries[0]).toMatchObject({ value: 'refreshed' })
  })
})

describe('StorageInfoCache（TTL 语义）', () => {
  it('条目在 TTL 内可读，过期后读取返回空', () => {
    const cache = new StorageInfoCache(2000)
    const data = {
      keys: ['k'],
      currentSize: 1,
      limitSize: 10240,
      keyCount: 1,
      timestamp: 100,
    }

    cache.set(data, 1000)
    expect(cache.get(2999)).toEqual(data)
    expect(cache.get(3000)).toBeNull()
  })

  it('作废后读取返回空', () => {
    const cache = new StorageInfoCache(2000)
    cache.set(
      { keys: [], currentSize: 0, limitSize: 10240, keyCount: 0, timestamp: 1 },
      1000,
    )
    cache.invalidate()
    expect(cache.get(1001)).toBeNull()
  })
})

describe('写操作通知 handler', () => {
  it('通知处理返回成功应答', async () => {
    const notify = createNotifyStorageChangedHandler()
    await expect(notify({ timestamp: 123 })).resolves.toEqual({ ok: true })
  })
})
