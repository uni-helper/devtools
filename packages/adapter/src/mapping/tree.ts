import type { ComponentTreeResult } from '@uni-helper/devtools-shared'
import type {
  AppSnapshot,
  ComponentTreeNodeSnapshot,
  ComponentTreePatch,
} from '@vue/devtools-kit'

export interface FlatTree {
  apps: AppSnapshot[]
  nodes: ComponentTreeNodeSnapshot[]
}

/** 探针 id 形如 `route#uid`（mock fixtures 同格式）。 */
export function appIdOf(id: string): string | undefined {
  const idx = id.indexOf('#')
  return idx > 0 ? id.slice(0, idx) : undefined
}

/** page 即一个 app（官方 AppSnapshot）；`updatedAt` 必填，取 fetchedAt。 */
export function buildFlatTree(tree: ComponentTreeResult): FlatTree {
  const apps: AppSnapshot[] = []
  const nodes: ComponentTreeNodeSnapshot[] = []
  for (const page of tree.pages ?? []) {
    const appId = page.route
    let count = 0
    const walk = (
      node: {
        id: string
        name: string
        file?: string
        children?: Array<{
          id: string
          name: string
          file?: string
          children?: unknown[]
        }>
      },
      parentId?: string,
    ): void => {
      nodes.push({
        id: node.id,
        appId,
        parentId,
        name: node.name,
        file: node.file,
        updatedAt: tree.fetchedAt,
        childCount: node.children?.length,
        tags: parentId === undefined ? [{ label: 'page' }] : undefined,
      })
      count++
      for (const child of node.children ?? [])
        walk(child as typeof node, node.id)
    }
    if (page.components) walk(page.components)
    // version 上报探针侧 Vue 运行时版本；面板用它做 Graph tab 门禁
    // （本地实现的 supportsReactivityGraphVueVersion，门槛 3.5.0）。
    // 门禁不通过时该 tab 仍可见，只是页面内说明原因（见 pages/graph.vue）
    apps.push({
      id: appId,
      name: page.route,
      ...(tree.vueVersion ? { version: tree.vueVersion } : {}),
      componentCount: count,
    })
  }
  return { apps, nodes }
}

export function sameAppSet(a: AppSnapshot[], b: AppSnapshot[]): boolean {
  if (a.length !== b.length) return false
  const ids = new Set(a.map((app) => app.id))
  return b.every((app) => ids.has(app.id))
}

export function computeTreeDiff(
  prev: FlatTree,
  next: FlatTree,
):
  | { kind: 'apps-changed' }
  | { kind: 'patches'; patchesByApp: Map<string, ComponentTreePatch[]> } {
  if (!sameAppSet(prev.apps, next.apps)) return { kind: 'apps-changed' }

  const patchesByApp = new Map<string, ComponentTreePatch[]>()
  const push = (appId: string, patch: ComponentTreePatch): void => {
    const list = patchesByApp.get(appId)
    if (list) list.push(patch)
    else patchesByApp.set(appId, [patch])
  }
  for (const node of prev.nodes) push(node.appId, { op: 'remove', id: node.id })
  for (const node of next.nodes)
    push(node.appId, { op: 'insert', parentId: node.parentId, node })

  return { kind: 'patches', patchesByApp }
}
