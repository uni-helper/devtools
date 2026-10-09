import { describe, expect, it } from 'vitest'
import {
  toVuexRootSnapshot,
  toVuexStateSnapshot,
  VUEX_ROOT_ID,
} from '../src/mapping/vuex'
import type { VuexStateResult } from '@uni-helper/devtools-shared'

describe('Vuex 快照转换', () => {
  it('按 State/Getters 分区并注入 inspector 元信息', () => {
    const store: VuexStateResult = {
      id: 'cart',
      state: { items: [], total: 0 },
      getters: { itemCount: 0, isEmpty: true },
      namespaced: true,
    }
    const snap = toVuexStateSnapshot(store, 1)

    expect(snap.componentId).toBe('inspector:vuex:module:cart')
    expect(snap.sections.map((s) => s.id)).toEqual(['state', 'getters'])

    // 检查元信息
    const stateEntry = snap.sections[0].entries[0]
    expect(stateEntry.meta).toMatchObject({
      inspectorId: 'vuex',
      nodeId: 'module:cart',
      disableAdd: true,
    })
    // 检查 warning 提示
    expect(stateEntry.meta?.warning).toContain('Direct state mutation')
  })

  it('state 可编辑、getters 不可编辑', () => {
    const store: VuexStateResult = {
      id: '_root',
      state: { count: 0 },
      getters: { double: 0 },
    }
    const snap = toVuexStateSnapshot(store, 1)

    const stateSection = snap.sections.find((s) => s.id === 'state')
    const gettersSection = snap.sections.find((s) => s.id === 'getters')

    expect(stateSection?.entries[0].editable).toBe(true)
    expect(gettersSection?.entries[0].editable).toBe(false)
  })

  it('root 节点使用 vuex-root 作为 nodeId（修复 Critical 1）', () => {
    const store: VuexStateResult = {
      id: '_root',
      state: { count: 0 },
      getters: { double: 0 },
    }
    const snap = toVuexStateSnapshot(store, 1)

    expect(snap.componentId).toBe('inspector:vuex:vuex-root')
    expect(snap.sections[0].entries[0].meta?.nodeId).toBe('vuex-root')
  })

  it('module 节点使用 module:<path> 作为 nodeId', () => {
    const store: VuexStateResult = {
      id: 'cart/products',
      state: { list: [] },
      getters: { count: 0 },
      namespaced: true,
    }
    const snap = toVuexStateSnapshot(store, 1)

    expect(snap.componentId).toBe('inspector:vuex:module:cart/products')
    expect(snap.sections[0].entries[0].meta?.nodeId).toBe(
      'module:cart/products',
    )
  })

  it('聚合根快照包含所有 stores 概览', () => {
    const stores: VuexStateResult[] = [
      { id: '_root', state: { count: 0 }, getters: { double: 0 } },
      {
        id: 'cart',
        state: { items: [] },
        getters: { total: 0 },
        namespaced: true,
      },
      {
        id: 'user',
        state: { name: '' },
        getters: { isLoggedIn: false },
        namespaced: true,
      },
    ]
    const snap = toVuexRootSnapshot(stores, 1)

    expect(snap.componentId).toBe('inspector:vuex:_root')
    expect(snap.sections.length).toBe(2) // State 和 Getters 分区

    const stateSection = snap.sections.find((s) => s.id === 'state')
    const gettersSection = snap.sections.find((s) => s.id === 'getters')

    // 验证每个 store 都有条目
    expect(stateSection?.entries.length).toBe(3)
    expect(gettersSection?.entries.length).toBe(3)

    // 验证聚合根条目都不可编辑（只读视图）
    expect(stateSection?.entries[0].editable).toBe(false)
    expect(gettersSection?.entries[0].editable).toBe(false)
  })

  it('聚合根条目必须包含完整元信息（修复 CR C1-A）', () => {
    const stores: VuexStateResult[] = [
      { id: '_root', state: { count: 0 }, getters: {} },
    ]
    const snap = toVuexRootSnapshot(stores, 1)

    const stateEntry = snap.sections[0].entries[0]

    // 验证元信息完整性
    expect(stateEntry.meta).toBeDefined()
    expect(stateEntry.meta?.inspectorId).toBe('vuex')
    expect(stateEntry.meta?.nodeId).toBe(VUEX_ROOT_ID)
    expect(stateEntry.meta?.disableAdd).toBe(true)
  })

  it('空 state 或 getters 时不创建对应分区', () => {
    const storeWithoutState: VuexStateResult = {
      id: 'empty',
      state: {},
      getters: { count: 0 },
    }
    const snap1 = toVuexStateSnapshot(storeWithoutState, 1)
    expect(snap1.sections.map((s) => s.id)).toEqual(['getters'])

    const storeWithoutGetters: VuexStateResult = {
      id: 'empty',
      state: { count: 0 },
      getters: {},
    }
    const snap2 = toVuexStateSnapshot(storeWithoutGetters, 1)
    expect(snap2.sections.map((s) => s.id)).toEqual(['state'])
  })

  it('State 条目包含 warning 提示（折中方案）', () => {
    const store: VuexStateResult = {
      id: '_root',
      state: { count: 0 },
      getters: {},
    }
    const snap = toVuexStateSnapshot(store, 1)

    const stateEntry = snap.sections[0].entries[0]
    expect(stateEntry.meta?.warning).toBeDefined()
    expect(stateEntry.meta?.warning).toContain('mutation')
  })
})
