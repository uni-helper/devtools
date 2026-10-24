import { describe, expect, it } from 'vitest'
import { mergeNetworkRecords } from '../src/utils/network-merge.ts'
import type { NetworkRecord } from '../src/types.ts'

function makeRecord(
  overrides: Partial<NetworkRecord> & { id: number },
): NetworkRecord {
  return {
    type: 'request',
    method: 'GET',
    url: `https://example.com/${overrides.id}`,
    status: 0,
    startTime: 1000,
    ok: false,
    ...overrides,
  }
}

describe('network-merge: node 侧 NetworkRecord 合并', () => {
  it('未知 id 插入，乱序到达仍保 id 升序', () => {
    const merged = mergeNetworkRecords(
      [makeRecord({ id: 2, duration: 10 })],
      [
        makeRecord({ id: 5, duration: 10 }),
        makeRecord({ id: 3, duration: 10 }),
      ],
    )
    expect(merged.map((r) => r.id)).toEqual([2, 3, 5])
  })

  it('pending → 已完成：同 id 覆盖为终态（回归：面板 FAIL 误报）', () => {
    const pending = makeRecord({ id: 1 })
    const completed = makeRecord({
      id: 1,
      status: 201,
      duration: 120,
      ok: true,
    })
    const merged = mergeNetworkRecords([pending], [completed])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      id: 1,
      status: 201,
      duration: 120,
      ok: true,
    })
  })

  it('终态落定后不被旧 pending 快照回滚（重连重推幂等）', () => {
    const completed = makeRecord({ id: 1, status: 200, duration: 80, ok: true })
    const stalePending = makeRecord({ id: 1 })
    const merged = mergeNetworkRecords([completed], [stalePending])
    expect(merged).toHaveLength(1)
    expect(merged[0].duration).toBe(80)
  })

  it('两次已完成等值重推：保留先值不抖动', () => {
    const first = makeRecord({ id: 1, status: 200, duration: 80, ok: true })
    const same = makeRecord({ id: 1, status: 200, duration: 80, ok: true })
    const merged = mergeNetworkRecords([first], [same])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toBe(first)
  })

  it('非法 id（NaN/非数字）不进合并结果', () => {
    const merged = mergeNetworkRecords(
      [],
      [
        makeRecord({ id: Number.NaN }),
        makeRecord({ id: undefined as unknown as number }),
        makeRecord({ id: 4, duration: 1 }),
      ],
    )
    expect(merged.map((r) => r.id)).toEqual([4])
  })
})
