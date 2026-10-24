import type { ComponentStateResult } from '@uni-helper/devtools-shared'
import { describe, expect, it } from 'vitest'
import { tagMap, tagSet } from '@uni-helper/devtools-shared/utils/tagged-value'
import { toStateEntry, toStateSnapshot } from '../src/mapping/state.ts'

describe('组件状态映射', () => {
  it('按官方分组输出 section，只保留非空分组且顺序固定', () => {
    const result: ComponentStateResult = {
      id: 'pages/index/index#1',
      name: 'IndexPage',
      props: { title: 'hi' },
      data: { count: 0 },
      setup: { foo: { value: 1, stateType: 'ref' } },
      setupOther: {
        onClick: {
          fn: true,
          fnName: 'onClick',
          fnSource: 'function onClick() {}',
        },
      },
      computed: { double: { value: 2, stateType: 'computed' } },
      attrs: { id: 'x' },
    }

    const snap = toStateSnapshot(result, 7)
    expect(snap.componentId).toBe('pages/index/index#1')
    expect(snap.version).toBe(7)
    expect(snap.sections.map((s) => s.id)).toEqual([
      'props',
      'data',
      'setup',
      'setup-other',
      'computed',
      'attrs',
    ])
    expect(snap.sections.map((s) => s.label)).toEqual([
      'Props',
      'Data',
      'Setup',
      'Setup (other)',
      'Computed',
      'Attrs',
    ])
  })

  it('空分组不出现在快照里', () => {
    const snap = toStateSnapshot({ id: 'c', name: 'C', props: { a: 1 } }, 0)
    expect(snap.sections.map((s) => s.id)).toEqual(['props'])
  })

  it('每条 entry 的 path 为 [sectionId, key]', () => {
    const snap = toStateSnapshot(
      { id: 'c', name: 'C', props: { title: 'hi' } },
      0,
    )
    expect(snap.sections[0].entries[0]).toMatchObject({
      key: 'title',
      path: ['props', 'title'],
    })
  })
})

describe('状态条目可编辑性', () => {
  it('props/data/setup 可编辑，computed/attrs 不可编辑', () => {
    expect(toStateEntry('props', 'a', { value: 1 }).editable).toBe(true)
    expect(toStateEntry('data', 'a', { value: 1 }).editable).toBe(true)
    expect(
      toStateEntry('setup', 'a', { value: 1, stateType: 'ref' }).editable,
    ).toBe(true)
    expect(
      toStateEntry('computed', 'a', { value: 1, stateType: 'computed' })
        .editable,
    ).toBe(false)
    expect(toStateEntry('attrs', 'a', { value: 1 }).editable).toBe(false)
  })

  it('setup 段的 readonly/computed 绑定不可编辑，显式声明优先', () => {
    expect(
      toStateEntry('setup', 'a', { value: 1, stateType: 'computed' }).editable,
    ).toBe(false)
    expect(
      toStateEntry('setup', 'a', { value: 1, readonly: true }).editable,
    ).toBe(false)
    expect(
      toStateEntry('setup', 'a', { value: 1, editable: false }).editable,
    ).toBe(false)
    expect(
      toStateEntry('props', 'a', { value: 1, editable: false }).editable,
    ).toBe(false)
  })
})

describe('状态条目编码', () => {
  it('函数绑定编码为 function 值，带名称与源码预览', () => {
    const entry = toStateEntry('setup-other', 'onClick', {
      fn: true,
      fnName: 'onClick',
      fnSource: 'function onClick() {}',
    })
    expect(entry.value).toEqual({
      kind: 'function',
      name: 'onClick',
      sourcePreview: 'function onClick() {}',
    })
  })

  it('响应式图谱随快照透传，无则省略字段', () => {
    const graph = { nodes: [], relationships: [] }
    const withGraph = toStateSnapshot(
      {
        id: 'c',
        name: 'C',
        reactivityGraph: graph as ComponentStateResult['reactivityGraph'],
      },
      0,
    )
    expect(withGraph.reactivityGraph).toBe(graph)

    const without = toStateSnapshot({ id: 'c', name: 'C' }, 0)
    expect('reactivityGraph' in without).toBe(false)
  })
})

describe('Map / Set 展示', () => {
  it('探针传来的 Map / Set 标记还原后按原生集合编码，面板显示条目而不是空对象', () => {
    const wireValue = JSON.parse(
      JSON.stringify({
        meta: tagMap([['env', 'dev']]),
        flags: tagSet(['read']),
      }),
    )

    const entry = toStateEntry('props', 'value', { value: wireValue })
    const encoded = entry.value as unknown as {
      preview: Array<{ key: string; value: { kind: string; size?: number } }>
    }
    const byKey = Object.fromEntries(
      encoded.preview.map((item) => [item.key, item.value]),
    )

    expect(byKey.meta).toMatchObject({ kind: 'map', size: 1 })
    expect(byKey.flags).toMatchObject({ kind: 'set', size: 1 })
  })
})

describe('Injected 分区', () => {
  it('探针的 injected 映射为官方 inject 分区，条目只读，排在 Attrs 之后', () => {
    const snapshot = toStateSnapshot(
      {
        id: 'pages/index#2',
        name: 'Consumer',
        attrs: { id: 'x' },
        injected: { 'themeName -> aliasedTheme': 'dark' },
      },
      0,
    )

    expect(snapshot.sections.map((s) => s.id)).toEqual(['attrs', 'inject'])
    const inject = snapshot.sections.find((s) => s.id === 'inject')!
    expect(inject.label).toBe('Injected')
    expect(inject.entries[0]).toMatchObject({
      key: 'themeName -> aliasedTheme',
      editable: false,
    })
  })
})
