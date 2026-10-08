import type { PiniaStateResult } from '@uni-helper/devtools-shared'
import { describe, expect, it } from 'vitest'
import {
  PINIA_ROOT_ID,
  PINIA_ROOT_LABEL,
  toPiniaRootSnapshot,
  toPiniaStateSnapshot,
} from '../src/mapping/pinia.ts'

describe('Pinia store 快照', () => {
  it('按 State/Getters 分区并注入 inspector 元信息', () => {
    const store: PiniaStateResult = {
      id: 'counter',
      state: { count: 1 },
      getters: { double: 2 },
    }
    const snap = toPiniaStateSnapshot(store, 3)

    expect(snap.componentId).toBe('inspector:pinia:store:counter')
    expect(snap.sections.map((s) => s.id)).toEqual(['state', 'getters'])
    for (const entry of snap.sections.flatMap((s) => s.entries))
      expect(entry.meta).toMatchObject({
        inspectorId: 'pinia',
        nodeId: 'store:counter',
        disableAdd: true,
      })
  })

  it('store state 可编辑、getters 不可编辑', () => {
    const snap = toPiniaStateSnapshot(
      { id: 'counter', state: { count: 1 }, getters: { double: 2 } },
      0,
    )
    const state = snap.sections.find((s) => s.id === 'state')!
    const getters = snap.sections.find((s) => s.id === 'getters')!

    expect(state.entries.every((e) => e.editable)).toBe(true)
    expect(getters.entries.every((e) => e.editable === false)).toBe(true)
  })
})

describe('Pinia 聚合根快照', () => {
  it('按 store id 聚合，无 getters 的 store 不出 getters 条目', () => {
    const states: PiniaStateResult[] = [
      { id: 'counter', state: { count: 1 }, getters: { double: 2 } },
      { id: 'user', state: { name: 'a' }, getters: {} },
    ]
    const snap = toPiniaRootSnapshot(states, 0)

    expect(PINIA_ROOT_ID).toBe('_root')
    expect(PINIA_ROOT_LABEL).toBe('🍍 Pinia (root)')
    expect(snap.componentId).toBe('inspector:pinia:_root')
    expect(snap.sections.map((s) => s.id)).toEqual(['state', 'getters'])
    expect(snap.sections[0].entries.map((e) => e.key)).toEqual([
      'counter',
      'user',
    ])
    expect(snap.sections[1].entries.map((e) => e.key)).toEqual(['counter'])
    for (const entry of snap.sections.flatMap((s) => s.entries))
      expect(entry.meta).toMatchObject({
        inspectorId: 'pinia',
        nodeId: '_root',
        disableAdd: true,
      })
  })
})
