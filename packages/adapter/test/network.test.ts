import type { NetworkRecord } from '@uni-helper/devtools-shared'
import { describe, expect, it, vi } from 'vitest'
import { mergeRecordsById } from '../src/mapping/network.ts'
import {
  handleNetworkSnapshot,
  validateNetworkSnapshot,
} from '../src/uni-devtools-rpc.ts'

const rec = (
  id: number,
  overrides: Partial<NetworkRecord> = {},
): NetworkRecord => ({
  id,
  type: 'request',
  method: 'GET',
  url: `https://example.com/${id}`,
  status: 200,
  startTime: id * 100,
  ok: true,
  ...overrides,
})

describe('网络记录合并', () => {
  it('同 id 覆盖、按 id 升序，未出现的历史记录保留', () => {
    const merged = mergeRecordsById(
      [rec(1), rec(2)],
      [rec(2, { status: 500, ok: false }), rec(3)],
      500,
    )

    expect(merged.map((r) => r.id)).toEqual([1, 2, 3])
    expect(merged[1]).toMatchObject({ id: 2, status: 500, ok: false })
  })

  it('超过容量上限只保留最新记录', () => {
    const merged = mergeRecordsById(
      [rec(1), rec(2), rec(3)],
      [rec(4), rec(5), rec(6)],
      4,
    )
    expect(merged.map((r) => r.id)).toEqual([3, 4, 5, 6])
  })
})

describe('网络快照格式校验 (validateNetworkSnapshot)', () => {
  it('非对象或 null/数组快照应校验失败', () => {
    expect(validateNetworkSnapshot(undefined).valid).toBe(false)
    expect(validateNetworkSnapshot(null).valid).toBe(false)
    expect(validateNetworkSnapshot('malformed string').valid).toBe(false)
    expect(validateNetworkSnapshot(12345).valid).toBe(false)
    expect(validateNetworkSnapshot([rec(1)]).valid).toBe(false)
  })

  it('records 字段非数组时应校验失败', () => {
    expect(
      validateNetworkSnapshot({
        records: 'not an array',
        latestId: 1,
        updatedAt: 1000,
      }).valid,
    ).toBe(false)
    expect(
      validateNetworkSnapshot({ records: 123, latestId: 1, updatedAt: 1000 })
        .valid,
    ).toBe(false)
    expect(
      validateNetworkSnapshot({ records: null, latestId: 1, updatedAt: 1000 })
        .valid,
    ).toBe(false)
    expect(
      validateNetworkSnapshot({ latestId: 1, updatedAt: 1000 }).valid,
    ).toBe(false)
  })

  it('缺少必需字段 latestId 或 updatedAt 时应校验失败', () => {
    expect(
      validateNetworkSnapshot({ records: [rec(1)], updatedAt: 1000 }).valid,
    ).toBe(false)
    expect(
      validateNetworkSnapshot({
        records: [rec(1)],
        latestId: '1',
        updatedAt: 1000,
      }).valid,
    ).toBe(false)
    expect(
      validateNetworkSnapshot({ records: [rec(1)], latestId: 1 }).valid,
    ).toBe(false)
    expect(
      validateNetworkSnapshot({
        records: [rec(1)],
        latestId: 1,
        updatedAt: '1000',
      }).valid,
    ).toBe(false)
  })

  it('格式完整的快照应校验通过', () => {
    const validSnapshot = {
      records: [rec(1), rec(2)],
      latestId: 2,
      updatedAt: 123456789,
    }
    const result = validateNetworkSnapshot(validSnapshot)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.snapshot.records).toHaveLength(2)
      expect(result.snapshot.latestId).toBe(2)
      expect(result.snapshot.updatedAt).toBe(123456789)
    }
  })
})

describe('网络快照更新处理 (handleNetworkSnapshot)', () => {
  it('畸形快照记录 warn 日志并跳过更新，不调用 applyRecords', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const applyFn = vi.fn()

    // 1. undefined 快照
    expect(handleNetworkSnapshot(undefined, applyFn)).toBe(false)
    // 2. records 为字符串的畸形快照
    expect(
      handleNetworkSnapshot(
        { records: 'corrupted-string', latestId: 0, updatedAt: 0 },
        applyFn,
      ),
    ).toBe(false)
    // 3. 缺少字段
    expect(handleNetworkSnapshot({ records: [] }, applyFn)).toBe(false)

    expect(applyFn).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(3)
    warnSpy.mockRestore()
  })

  it('applyRecords 内部异常被捕获并记录 error 日志，不会抛出崩溃', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failingApply = vi.fn(() => {
      throw new Error('Simulated apply error')
    })

    const validSnapshot = {
      records: [rec(1)],
      latestId: 1,
      updatedAt: 1000,
    }

    expect(() => {
      const ok = handleNetworkSnapshot(validSnapshot, failingApply)
      expect(ok).toBe(false)
    }).not.toThrow()

    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('后续正常快照仍能正常处理（订阅不崩溃）', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const applied: NetworkRecord[][] = []
    const applyFn = vi.fn((records: NetworkRecord[]) => {
      applied.push(records)
    })

    // 第一次：畸形快照（跳过）
    handleNetworkSnapshot({ records: 'malformed' }, applyFn)
    expect(applied).toHaveLength(0)

    // 第二次：正常快照（成功消费）
    const valid1 = { records: [rec(1)], latestId: 1, updatedAt: 2000 }
    handleNetworkSnapshot(valid1, applyFn)
    expect(applied).toHaveLength(1)
    expect(applied[0].map((r) => r.id)).toEqual([1])

    // 第三次：再次遇到畸形快照（跳过）
    handleNetworkSnapshot(null, applyFn)
    expect(applied).toHaveLength(1)

    // 第四次：正常快照（继续正常消费）
    const valid2 = { records: [rec(1), rec(2)], latestId: 2, updatedAt: 3000 }
    handleNetworkSnapshot(valid2, applyFn)
    expect(applied).toHaveLength(2)
    expect(applied[1].map((r) => r.id)).toEqual([1, 2])

    warnSpy.mockRestore()
  })
})
