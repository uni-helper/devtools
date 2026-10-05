import type { ComponentTreeResult } from '@uni-helper/devtools-devframe/types'
import type { AppSnapshot, ComponentTreeNodeSnapshot } from '@vue/devtools-kit'
import { describe, expect, it } from 'vitest'
import { appIdOf, buildFlatTree, computeTreeDiff, sameAppSet } from '../../src/adapter/mapping/tree'

type PageTree = ComponentTreeResult['pages'][number]

const page = (route: string, components: PageTree['components']): PageTree => ({ route, components })

const tree: ComponentTreeResult = {
  fetchedAt: 1000,
  vueVersion: '3.5.13',
  pages: [
    page('pages/index/index', {
      id: 'pages/index/index#1',
      name: 'IndexPage',
      type: 'page',
      file: '/src/pages/index/index.vue',
      children: [
        {
          id: 'pages/index/index#2',
          name: 'AppHeader',
          type: 'component',
          file: '/src/components/AppHeader.vue',
          children: [
            { id: 'pages/index/index#3', name: 'UserAvatar', type: 'component' },
          ],
        },
      ],
    }),
    page('pages/settings/settings', {
      id: 'pages/settings/settings#1',
      name: 'SettingsPage',
      type: 'page',
      children: [],
    }),
  ],
}

const appSnap = (id: string): AppSnapshot => ({ id, name: id, componentCount: 0 })
const mkNode = (id: string, appId: string, parentId?: string): ComponentTreeNodeSnapshot => ({
  id,
  appId,
  parentId,
  name: id,
  updatedAt: 0,
})

describe('组件 id 与页面归属', () => {
  it('组件 id 解出所属页面，无分隔符则无 appId', () => {
    expect(appIdOf('pages/index/index#3')).toBe('pages/index/index')
    expect(appIdOf('nohash')).toBeUndefined()
    expect(appIdOf('#3')).toBeUndefined()
  })
})

describe('组件树映射', () => {
  it('嵌套组件树展平为带 parentId 的扁平快照，page 根带标签', () => {
    const { nodes } = buildFlatTree(tree)
    expect(nodes.map(n => n.id)).toEqual([
      'pages/index/index#1',
      'pages/index/index#2',
      'pages/index/index#3',
      'pages/settings/settings#1',
    ])

    const byId = new Map(nodes.map(n => [n.id, n]))
    expect(byId.get('pages/index/index#1')).toMatchObject({
      appId: 'pages/index/index',
      parentId: undefined,
      name: 'IndexPage',
      file: '/src/pages/index/index.vue',
      updatedAt: 1000,
      childCount: 1,
      tags: [{ label: 'page' }],
    })
    expect(byId.get('pages/index/index#3')).toMatchObject({ parentId: 'pages/index/index#2' })
    expect(byId.get('pages/index/index#3')?.tags).toBeUndefined()
  })

  it('每个组件节点归属其页面 appId，多页不串', () => {
    const { nodes } = buildFlatTree(tree)
    for (const n of nodes)
      expect(n.appId).toBe(n.id.split('#')[0])
  })

  it('每个页面映射为一个 app 快照，计数与版本透传', () => {
    const { apps } = buildFlatTree(tree)
    expect(apps).toEqual([
      { id: 'pages/index/index', name: 'pages/index/index', version: '3.5.13', componentCount: 3 },
      { id: 'pages/settings/settings', name: 'pages/settings/settings', version: '3.5.13', componentCount: 1 },
    ])
  })

  it('页面无组件或无版本上报时不带多余字段', () => {
    const { apps } = buildFlatTree({ fetchedAt: 0, pages: [page('a', null)] })
    expect(apps).toEqual([{ id: 'a', name: 'a', componentCount: 0 }])
  })
})

describe('组件树增量差异', () => {
  it('app 集合相同的树更新产出按 appId 分组的补丁，先删后插', () => {
    const prev = { apps: [appSnap('a')], nodes: [mkNode('a#1', 'a'), mkNode('a#2', 'a', 'a#1')] }
    const next = { apps: [appSnap('a')], nodes: [mkNode('a#1', 'a'), mkNode('a#3', 'a', 'a#1')] }

    const diff = computeTreeDiff(prev, next)
    expect(diff.kind).toBe('patches')
    if (diff.kind !== 'patches')
      throw new Error('unreachable')

    expect(diff.patchesByApp.get('a')).toEqual([
      { op: 'remove', id: 'a#1' },
      { op: 'remove', id: 'a#2' },
      { op: 'insert', parentId: undefined, node: next.nodes[0] },
      { op: 'insert', parentId: 'a#1', node: next.nodes[1] },
    ])
  })

  it('app 集合变化走全量刷新而非补丁', () => {
    const prev = { apps: [appSnap('a')], nodes: [mkNode('a#1', 'a')] }
    const next = { apps: [appSnap('a'), appSnap('b')], nodes: [mkNode('a#1', 'a'), mkNode('b#1', 'b')] }
    expect(computeTreeDiff(prev, next).kind).toBe('apps-changed')
  })

  it('app 集合按 id 判定相等，与顺序无关', () => {
    expect(sameAppSet([appSnap('a'), appSnap('b')], [appSnap('b'), appSnap('a')])).toBe(true)
    expect(sameAppSet([appSnap('a')], [appSnap('a'), appSnap('b')])).toBe(false)
  })
})
