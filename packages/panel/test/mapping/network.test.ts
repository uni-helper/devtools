import type { NetworkRecord } from '../../src/types/network'
import { describe, expect, it } from 'vitest'
import { mergeRecordsById } from '../../src/adapter/mapping/network'

const rec = (id: number, overrides: Partial<NetworkRecord> = {}): NetworkRecord => ({
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

    expect(merged.map(r => r.id)).toEqual([1, 2, 3])
    expect(merged[1]).toMatchObject({ id: 2, status: 500, ok: false })
  })

  it('超过容量上限只保留最新记录', () => {
    const merged = mergeRecordsById([rec(1), rec(2), rec(3)], [rec(4), rec(5), rec(6)], 4)
    expect(merged.map(r => r.id)).toEqual([3, 4, 5, 6])
  })
})
