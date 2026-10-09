import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NODE_RPC } from '@uni-helper/devtools-shared'
import {
  createStorageCapability,
  getUtf8ByteLength,
  installStorageWriteInterceptors,
  safeSerialize,
  __resetStorageForTest,
} from '../src/runtime/storage'

describe('storage: 探针 Storage 收集能力（微信小程序）', () => {
  let fakeUni: any
  let mockRpcCall: any
  let mockActiveInstance: any

  beforeEach(() => {
    vi.useRealTimers()
    __resetStorageForTest()

    mockRpcCall = vi.fn().mockResolvedValue({ ok: true })
    mockActiveInstance = {
      rpc: {
        $call: mockRpcCall,
      },
      socketHandle: {
        isConnected: vi.fn().mockReturnValue(true),
      },
    }

    // 内存 Storage 模拟
    const storageStore = new Map<string, any>()
    storageStore.set('k1', 'v1')
    storageStore.set('k2', { count: 42 })

    fakeUni = {
      getStorageInfo(options: any) {
        const keys = Array.from(storageStore.keys())
        const res = {
          keys,
          currentSize: 12,
          limitSize: 10240,
          keyCount: keys.length,
        }
        if (options && typeof options.success === 'function') {
          options.success(res)
        }
        return res
      },
      getStorage(options: any) {
        const key = options?.key
        if (storageStore.has(key)) {
          const res = { data: storageStore.get(key) }
          if (options && typeof options.success === 'function') {
            options.success(res)
          }
          return res
        }
        const err = { errMsg: 'getStorage:fail data not found' }
        if (options && typeof options.fail === 'function') {
          options.fail(err)
        }
        return err
      },
      setStorage(options: any) {
        storageStore.set(options.key, options.data)
        if (options && typeof options.success === 'function') {
          options.success({ errMsg: 'setStorage:ok' })
        }
        if (options && typeof options.complete === 'function') {
          options.complete({ errMsg: 'setStorage:ok' })
        }
        return { errMsg: 'setStorage:ok' }
      },
      setStorageSync(key: string, data: any) {
        storageStore.set(key, data)
        return undefined
      },
      removeStorage(options: any) {
        storageStore.delete(options.key)
        if (options && typeof options.success === 'function') {
          options.success({ errMsg: 'removeStorage:ok' })
        }
        if (options && typeof options.complete === 'function') {
          options.complete({ errMsg: 'removeStorage:ok' })
        }
        return { errMsg: 'removeStorage:ok' }
      },
      removeStorageSync(key: string) {
        storageStore.delete(key)
        return undefined
      },
      clearStorage(options?: any) {
        storageStore.clear()
        if (options && typeof options.success === 'function') {
          options.success({ errMsg: 'clearStorage:ok' })
        }
        if (options && typeof options.complete === 'function') {
          options.complete({ errMsg: 'clearStorage:ok' })
        }
        return { errMsg: 'clearStorage:ok' }
      },
      clearStorageSync() {
        storageStore.clear()
        return undefined
      },
    }

    ;(globalThis as any).uni = fakeUni
  })

  afterEach(() => {
    __resetStorageForTest()
    delete (globalThis as any).uni
    vi.restoreAllMocks()
  })

  describe('1. Storage 元数据查询', () => {
    it('Storage 元数据查询返回 keys、已用容量、容量上限与 key 总数', async () => {
      // Given: uni 提供标准的 getStorageInfo 回调
      const capability = createStorageCapability()

      // When: 调用 getInfo
      const info = await capability.getInfo()

      // Then: 正确映射各字段，且 limitSize 缺省保底 10240
      expect(info.keys).toEqual(['k1', 'k2'])
      expect(info.currentSize).toBe(12)
      expect(info.limitSize).toBe(10240)
      expect(info.keyCount).toBe(2)
      expect(typeof info.timestamp).toBe('number')
      expect(info.timestamp).toBeGreaterThan(0)
    })

    it('Storage 元数据查询在平台未返回 limitSize 时保底为 10240 KB', async () => {
      // Given: uni.getStorageInfo 不返回 limitSize
      fakeUni.getStorageInfo = (options: any) => {
        options.success({
          keys: ['test'],
          currentSize: 5,
        })
      }
      const capability = createStorageCapability()

      // When: 调用 getInfo
      const info = await capability.getInfo()

      // Then: limitSize 保底为 10240
      expect(info.limitSize).toBe(10240)
      expect(info.keyCount).toBe(1)
    })
  })

  describe('2. 无过滤参数的键值查询', () => {
    it('无过滤参数的键值查询返回全部条目（默认上限 50）', async () => {
      // Given: 构造 60 个 storage key
      const bigStore = new Map<string, any>()
      for (let i = 0; i < 60; i++) {
        bigStore.set(`key_${String(i).padStart(2, '0')}`, `val_${i}`)
      }
      fakeUni.getStorageInfo = (opts: any) =>
        opts.success({ keys: Array.from(bigStore.keys()), currentSize: 60 })
      fakeUni.getStorage = (opts: any) =>
        opts.success({ data: bigStore.get(opts.key) })

      const capability = createStorageCapability()

      // When: 无参数查询
      const res = await capability.getEntries({})

      // Then: 默认截断到前 50 条，total 为 60，hasMore 为 true
      expect(res.entries).toHaveLength(50)
      expect(res.entries[0]).toEqual({ key: 'key_00', value: 'val_0' })
      expect(res.total).toBe(60)
      expect(res.hasMore).toBe(true)
    })
  })

  describe('3. 精确 keys 过滤优先级与去重', () => {
    it('精确 keys 过滤优先于正则匹配并去重', async () => {
      // Given: 存在多个 key，同时指定 keys 与 matchPattern
      const capability = createStorageCapability()

      // When: 传递重复的 keys 列表，并附加 matchPattern
      const res = await capability.getEntries({
        keys: ['k1', 'k1'],
        matchPattern: '^k2$',
      })

      // Then: 精确 keys 优先，且自动去重为 1 条
      expect(res.entries).toHaveLength(1)
      expect(res.entries[0].key).toBe('k1')
      expect(res.entries[0].value).toBe('v1')
      expect(res.total).toBe(1)
      expect(res.hasMore).toBe(false)
    })
  })

  describe('4. 正则匹配过滤与非法正则防御', () => {
    it('正则匹配过滤目标 keys', async () => {
      // Given: 存在前缀不同的 key
      fakeUni.getStorageInfo = (opts: any) =>
        opts.success({ keys: ['user_token', 'user_id', 'sys_config'] })
      fakeUni.getStorage = (opts: any) =>
        opts.success({ data: `data_of_${opts.key}` })

      const capability = createStorageCapability()

      // When: 使用正则匹配 ^user_
      const res = await capability.getEntries({ matchPattern: '^user_' })

      // Then: 仅返回匹配的 keys
      expect(res.entries.map((e) => e.key)).toEqual(['user_token', 'user_id'])
      expect(res.total).toBe(2)
      expect(res.hasMore).toBe(false)
    })

    it('非法正则查询被拒绝并抛出明确错误', async () => {
      // Given: 构造非法正则表达式
      const capability = createStorageCapability()

      // When & Then: 非法正则被拒绝抛错，不被静默吞掉
      await expect(
        capability.getEntries({ matchPattern: '[invalid regex (' }),
      ).rejects.toThrow(/invalid/i)
    })
  })

  describe('5. 分页参数与 limit 钳制', () => {
    it('分页参数控制返回窗口并如实报告总数与是否还有更多；limit 超过 200 被钳制', async () => {
      // Given: 250 个 key
      const keys = Array.from({ length: 250 }, (_, i) => `k_${i}`)
      fakeUni.getStorageInfo = (opts: any) => opts.success({ keys })
      fakeUni.getStorage = (opts: any) => opts.success({ data: opts.key })

      const capability = createStorageCapability()

      // When: offset 10, limit 20
      const page1 = await capability.getEntries({ offset: 10, limit: 20 })
      expect(page1.entries).toHaveLength(20)
      expect(page1.entries[0].key).toBe('k_10')
      expect(page1.total).toBe(250)
      expect(page1.hasMore).toBe(true)

      // When: 尾页 offset 240, limit 20
      const pageLast = await capability.getEntries({ offset: 240, limit: 20 })
      expect(pageLast.entries).toHaveLength(10)
      expect(pageLast.entries[0].key).toBe('k_240')
      expect(pageLast.hasMore).toBe(false)

      // When: limit 传 500
      const clamped = await capability.getEntries({ offset: 0, limit: 500 })
      // Then: limit 钳制在 200
      expect(clamped.entries).toHaveLength(200)
      expect(clamped.hasMore).toBe(true)
    })
  })

  describe('6. 超长值截断与标记', () => {
    it('超长值被截断并标记不完整', async () => {
      // Given: 长度为 100 字符的字符串
      const longStr = 'a'.repeat(100)
      fakeUni.getStorageInfo = (opts: any) => opts.success({ keys: ['big'] })
      fakeUni.getStorage = (opts: any) => opts.success({ data: longStr })

      const capability = createStorageCapability()

      // When: maxValueChars 设置为 40
      const res = await capability.getEntries({
        keys: ['big'],
        maxValueChars: 40,
      })

      // Then: value 被截断为前 40 字符并标记 truncated
      expect(res.entries).toHaveLength(1)
      const entry = res.entries[0]
      expect(entry.truncated).toBe(true)
      expect(entry.value).toBe(JSON.stringify(longStr).slice(0, 40))
      expect((entry.value as string).length).toBe(40)
    })
  })

  describe('7. 单条取值失败的错误隔离', () => {
    it('单条取值失败不影响其余条目（错误隔离）', async () => {
      // Given: k1 成功，k2 失败
      fakeUni.getStorageInfo = (opts: any) =>
        opts.success({ keys: ['k1', 'k2'] })
      fakeUni.getStorage = (opts: any) => {
        if (opts.key === 'k1') {
          opts.success({ data: 'val_1' })
        } else {
          opts.fail({ errMsg: 'getStorage:fail disk read error' })
        }
      }

      const capability = createStorageCapability()

      // When: 查询全部条目
      const res = await capability.getEntries({ keys: ['k1', 'k2'] })

      // Then: k1 正常返回，k2 返回隔离错误条目
      expect(res.entries).toHaveLength(2)
      expect(res.entries[0]).toEqual({ key: 'k1', value: 'val_1' })
      expect(res.entries[1]).toMatchObject({
        key: 'k2',
        value: null,
        error: expect.stringContaining('disk read error'),
      })
    })
  })

  describe('8. 不可序列化的值错误呈现', () => {
    it('不可序列化的值以错误条目呈现而非整体失败', async () => {
      // Given: 循环引用对象不可 JSON.stringify
      const circular: any = { a: 1 }
      circular.self = circular

      fakeUni.getStorageInfo = (opts: any) =>
        opts.success({ keys: ['bad', 'good'] })
      fakeUni.getStorage = (opts: any) => {
        if (opts.key === 'bad') {
          opts.success({ data: circular })
        } else {
          opts.success({ data: 'ok' })
        }
      }

      const capability = createStorageCapability()

      // When: 查询 bad 和 good
      const res = await capability.getEntries({ keys: ['bad', 'good'] })

      // Then: bad 单条隔离为错误，good 正常返回
      expect(res.entries).toHaveLength(2)
      expect(res.entries[0]).toMatchObject({
        key: 'bad',
        value: null,
        error: expect.any(String),
      })
      expect(res.entries[1]).toEqual({ key: 'good', value: 'ok' })
    })
  })

  describe('9. UTF-8 字节大小计算', () => {
    it('includeSize 时每条返回 UTF-8 字节大小（中文等多字节字符算对）', async () => {
      // Given: 包含中文与 Emoji 的条目
      fakeUni.getStorageInfo = (opts: any) =>
        opts.success({ keys: ['ascii', 'chinese', 'emoji'] })
      fakeUni.getStorage = (opts: any) => {
        if (opts.key === 'ascii') opts.success({ data: 'hello' })
        if (opts.key === 'chinese') opts.success({ data: '微信' })
        if (opts.key === 'emoji') opts.success({ data: '🚀' })
      }

      const capability = createStorageCapability()

      // When: includeSize = true
      const res = await capability.getEntries({
        keys: ['ascii', 'chinese', 'emoji'],
        includeSize: true,
      })

      // Then: 返回 size 且与 UTF-8 字节长一致
      // JSON.stringify('hello') = '"hello"' (7 字节)
      // JSON.stringify('微信') = '"微信"' (2 引号 + 6 字节中文 = 8 字节)
      // JSON.stringify('🚀') = '"🚀"' (2 引号 + 4 字节 emoji = 6 字节)
      expect(res.entries[0].size).toBe(7)
      expect(res.entries[1].size).toBe(8)
      expect(res.entries[2].size).toBe(6)

      // 验证手写 getUtf8ByteLength 工具函数纯净度
      expect(getUtf8ByteLength('hello')).toBe(5)
      expect(getUtf8ByteLength('微信')).toBe(6)
      expect(getUtf8ByteLength('🚀')).toBe(4)
    })
  })

  describe('10. 不存在的 key 显式 miss', () => {
    it('请求了不存在的 key 时得到显式 miss 条目', async () => {
      // Given: storage 仅有 k1
      const capability = createStorageCapability()

      // When: 请求 k1 和不存在的 non_existing
      const res = await capability.getEntries({
        keys: ['k1', 'non_existing'],
      })

      // Then: 显式返回 key not found
      expect(res.entries).toHaveLength(2)
      expect(res.entries[0]).toEqual({ key: 'k1', value: 'v1' })
      expect(res.entries[1]).toEqual({
        key: 'non_existing',
        value: null,
        error: 'key not found',
      })
    })
  })

  describe('11. 写操作触发失效通知推送', () => {
    it('写操作（含 Sync 变体）触发一次失效通知推送', () => {
      installStorageWriteInterceptors({
        getUni: () => fakeUni,
        getActiveInstance: () => mockActiveInstance,
      })

      // 1. setStorage 回调式
      fakeUni.setStorage({ key: 'new_k', data: 'new_v', success: () => {} })
      expect(mockRpcCall).toHaveBeenCalledTimes(1)
      expect(mockRpcCall).toHaveBeenLastCalledWith(
        NODE_RPC.notifyStorageChanged,
        expect.objectContaining({ timestamp: expect.any(Number) }),
      )

      // 2. setStorageSync
      fakeUni.setStorageSync('sync_k', 'sync_v')
      expect(mockRpcCall).toHaveBeenCalledTimes(2)

      // 3. removeStorage
      fakeUni.removeStorage({ key: 'new_k', success: () => {} })
      expect(mockRpcCall).toHaveBeenCalledTimes(3)

      // 4. removeStorageSync
      fakeUni.removeStorageSync('sync_k')
      expect(mockRpcCall).toHaveBeenCalledTimes(4)

      // 5. clearStorage
      fakeUni.clearStorage({ success: () => {} })
      expect(mockRpcCall).toHaveBeenCalledTimes(5)

      // 6. clearStorageSync
      fakeUni.clearStorageSync()
      expect(mockRpcCall).toHaveBeenCalledTimes(6)
    })

    it('Promise 式异步写操作成功后触发失效通知', async () => {
      // Given: 异步 setStorage 返回 Promise
      fakeUni.setStorage = () => Promise.resolve({ errMsg: 'setStorage:ok' })
      installStorageWriteInterceptors({
        getUni: () => fakeUni,
        getActiveInstance: () => mockActiveInstance,
      })

      // When: Promise 形式调用
      await fakeUni.setStorage({ key: 'p_k', data: 'p_v' })

      // Then: 触发推送
      expect(mockRpcCall).toHaveBeenCalledTimes(1)
      expect(mockRpcCall).toHaveBeenLastCalledWith(
        NODE_RPC.notifyStorageChanged,
        expect.objectContaining({ timestamp: expect.any(Number) }),
      )
    })

    it('写操作失败时不触发失效通知推送', () => {
      // Given: setStorage 失败
      fakeUni.setStorage = (opts: any) => {
        if (opts.fail) opts.fail({ errMsg: 'fail' })
      }
      fakeUni.setStorageSync = () => {
        throw new Error('quota exceeded')
      }

      installStorageWriteInterceptors({
        getUni: () => fakeUni,
        getActiveInstance: () => mockActiveInstance,
      })

      // When: 异步调用失败
      fakeUni.setStorage({ key: 'fail_k', data: 'v', fail: () => {} })
      expect(mockRpcCall).not.toHaveBeenCalled()

      // When: 同步调用抛错
      expect(() => fakeUni.setStorageSync('fail_sync', 'v')).toThrow(
        'quota exceeded',
      )
      expect(mockRpcCall).not.toHaveBeenCalled()
    })
  })

  describe('12. 写包装完全透传原 API 语义', () => {
    it('写包装完全透传原 API 语义（回调参数、返回值与 this 原样）', () => {
      const userSuccess = vi.fn()
      const userComplete = vi.fn()

      const expectedContext = { custom: true }
      const expectedReturn = { taskId: 'custom-storage-ret' }

      fakeUni.setStorage = function (this: any, opts: any) {
        expect(this).toBe(expectedContext)
        opts.success({ customData: 123 })
        opts.complete({ customComplete: 456 })
        return expectedReturn
      }

      installStorageWriteInterceptors({
        getUni: () => fakeUni,
        getActiveInstance: () => mockActiveInstance,
      })

      // When: 绑定 this 调用
      const ret = fakeUni.setStorage.call(expectedContext, {
        key: 'ctx_k',
        data: 'ctx_v',
        success: userSuccess,
        complete: userComplete,
      })

      // Then: 原样透传
      expect(ret).toBe(expectedReturn)
      expect(userSuccess).toHaveBeenCalledWith({ customData: 123 })
      expect(userComplete).toHaveBeenCalledWith({ customComplete: 456 })
    })
  })

  describe('13. 拦截器幂等性', () => {
    it('重复安装拦截器不产生双包或双推送', () => {
      // When: 安装两次
      installStorageWriteInterceptors({
        getUni: () => fakeUni,
        getActiveInstance: () => mockActiveInstance,
      })
      installStorageWriteInterceptors({
        getUni: () => fakeUni,
        getActiveInstance: () => mockActiveInstance,
      })

      // When: 执行一次同步写
      fakeUni.setStorageSync('idempotent', 'val')

      // Then: 仅触发一次通知
      expect(mockRpcCall).toHaveBeenCalledTimes(1)
    })
  })

  describe('14. safeSerialize 工具函数', () => {
    it('正常值原样返回，循环引用返回 [Unserializable]', () => {
      expect(safeSerialize({ ok: true })).toEqual({ ok: true })
      expect(safeSerialize('string')).toBe('string')
      expect(safeSerialize(123)).toBe(123)

      const bad: any = {}
      bad.bad = bad
      expect(safeSerialize(bad)).toBe('[Unserializable]')
    })
  })

  describe('15. 运行时缺失防御', () => {
    it('uni 不存在时创建能力抛出明确异常', () => {
      delete (globalThis as any).uni
      expect(() => createStorageCapability()).toThrow(/uni.*available/i)
    })
  })
})
