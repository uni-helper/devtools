import { computed, reactive, ref, shallowRef, triggerRef } from 'vue'
import type { ComponentStateResult, ComponentTreeNode, PageComponentTree } from '@/df/types'
import { rpc, subscribeComponentTree } from '@/df/client'

/**
 * 组件检查器的全部 UI 状态。
 *
 * 刻意只用原生 `ref`/`computed`/`reactive`（规范 §7：不引入冗余全局 Store）：
 * 状态只此一份、只读暴露，写操作全部走下面这几个显式 action。
 */

// ---------------------------------------------------------------- 树

const pages = shallowRef<PageComponentTree[]>([])
const treeLoading = ref(false)
const treeError = shallowRef<Error | null>(null)
const fetchedAt = ref<number | null>(null)

const filterText = ref('')
const expanded = reactive(new Set<string>())
const selectedId = ref<string | null>(null)

// ---------------------------------------------------------------- 组件状态

const stateById = shallowRef(new Map<string, ComponentStateResult>())
const stateLoading = ref(false)
const stateError = shallowRef<Error | null>(null)
/** 最近一次写回的结果，供行内编辑展示成功/失败（key 为 `id:key`）。 */
const commitState = ref<{ key: string, ok: boolean, message?: string } | null>(null)

export interface TreeRow {
  node: ComponentTreeNode
  depth: number
  /** 该节点所属页面的路由（页面自身行等于自己的路由）。 */
  pageRoute: string
  hasChildren: boolean
  expanded: boolean
  /** 过滤命中（自身名称或文件路径匹配）。 */
  hit: boolean
  /** 页面组件树采集失败（探针返回 `components: null`）。 */
  failed?: boolean
}

const PAGE_ID_PREFIX = 'page:'

function nodeMatches(node: ComponentTreeNode, q: string): boolean {
  return node.name.toLowerCase().includes(q) || (node.file?.toLowerCase().includes(q) ?? false)
}

/** 收集「自身或任一后代命中」的节点 id；返回值表示该子树整体是否命中。 */
function collectMatches(node: ComponentTreeNode, q: string, out: Set<string>): boolean {
  let subtreeHit = false
  if (nodeMatches(node, q)) {
    out.add(node.id)
    subtreeHit = true
  }
  for (const child of node.children ?? []) {
    if (collectMatches(child, q, out))
      subtreeHit = true
  }
  return subtreeHit
}

/**
 * 展开后的可见行列表。
 *
 * 过滤语义对齐 Vue DevTools：命中项保留，其祖先自动展开（无需手动展开就能
 * 看到全部命中），未命中的兄弟分支整支隐藏；清空过滤即恢复手动展开状态。
 */
const rows = computed<TreeRow[]>(() => {
  const q = filterText.value.trim().toLowerCase()
  const filtering = q.length > 0

  const hits = new Set<string>()
  if (filtering) {
    for (const page of pages.value) {
      if (page.components) {
        collectMatches(page.components, q, hits)
      }
      else if (page.route.toLowerCase().includes(q)) {
        hits.add(`${PAGE_ID_PREFIX}${page.route}`)
      }
    }
  }

  const out: TreeRow[] = []

  const visit = (node: ComponentTreeNode, depth: number, pageRoute: string): void => {
    if (filtering && !hits.has(node.id))
      return
    const hasChildren = (node.children?.length ?? 0) > 0
    const isExpanded = filtering ? true : expanded.has(node.id)
    out.push({
      node,
      depth,
      pageRoute,
      hasChildren,
      expanded: isExpanded,
      hit: filtering && nodeMatches(node, q),
    })
    if (hasChildren && isExpanded) {
      for (const child of node.children!)
        visit(child, depth + 1, pageRoute)
    }
  }

  for (const page of pages.value) {
    if (page.components) {
      visit(page.components, 0, page.route)
    }
    else {
      // 采集失败的页面仍占一行（可选中），避免页面“凭空消失”让用户误以为
      // 是过滤逻辑坏了。
      out.push({
        node: { id: `${PAGE_ID_PREFIX}${page.route}`, name: page.route, type: 'page' },
        depth: 0,
        pageRoute: page.route,
        hasChildren: false,
        expanded: false,
        hit: filtering && page.route.toLowerCase().includes(q),
        failed: true,
      })
    }
  }

  return out
})

/**
 * 选中节点以**原始树**为准，而不是当前可见行：过滤条件变化或祖先被折叠后，
 * 已选中节点可能暂时不可见，但右侧面板仍应稳定展示它的信息。
 */
const selectedNode = computed<ComponentTreeNode | undefined>(() => {
  const id = selectedId.value
  if (!id)
    return undefined
  for (const page of pages.value) {
    const found = page.components && findNode(page.components, id)
    if (found)
      return found
  }
  return undefined
})

function findNode(node: ComponentTreeNode, id: string): ComponentTreeNode | undefined {
  if (node.id === id)
    return node
  for (const child of node.children ?? []) {
    const found = findNode(child, id)
    if (found)
      return found
  }
  return undefined
}

const selectedState = computed(() =>
  selectedId.value ? stateById.value.get(selectedId.value) : undefined,
)

// ---------------------------------------------------------------- actions

export async function refreshTree(): Promise<void> {
  treeLoading.value = true
  treeError.value = null
  try {
    const result = await rpc.getComponentTree()
    // 契约上 pages 恒为数组（node 侧 `?? []` 兜底），这里再防一次探针/链路上的畸形返回。
    pages.value = result.pages ?? []
    fetchedAt.value = result.fetchedAt
    // 页面根默认展开一层（对齐 Vue Devtools 的开箱观感：一进来就能看到
    // 组件，而不是一棵全折叠、看似空树的结构）；更深层保持手动展开。
    for (const page of result.pages) {
      if (page.components)
        expanded.add(page.components.id)
    }
    // 首次加载时选中第一行，让右侧面板立刻有内容可看。
    if (!selectedId.value && rows.value.length > 0)
      select(rows.value[0]!.node.id)
  }
  catch (error) {
    treeError.value = error as Error
  }
  finally {
    treeLoading.value = false
  }
}

export function select(id: string): void {
  selectedId.value = id
  if (!stateById.value.has(id))
    void loadState(id)
}

export function toggleExpand(id: string): void {
  if (expanded.has(id))
    expanded.delete(id)
  else
    expanded.add(id)
}

export function setFilter(value: string): void {
  filterText.value = value
}

async function loadState(id: string): Promise<void> {
  stateLoading.value = true
  stateError.value = null
  try {
    const result = await rpc.getComponentState(id)
    const next = new Map(stateById.value)
    next.set(id, result)
    stateById.value = next
  }
  catch (error) {
    stateError.value = error as Error
  }
  finally {
    stateLoading.value = false
  }
}

/**
 * 行内编辑提交。探针侧目前只支持顶层 key 的写入（嵌套路径未实现），提交前
 * 就地把这个约束讲清楚，避免用户以为是面板吞了他的修改。
 */
export async function commitValue(id: string, key: string, value: unknown): Promise<boolean> {
  commitState.value = { key: `${id}:${key}`, ok: false }
  try {
    await rpc.updateComponentState({ id, key, value })
    commitState.value = { key: `${id}:${key}`, ok: true }
    // 写回成功后重新拉一次该组件的状态：探针可能对值做了清洗/归一化，
    // 以服务端回读为准，而不是本地乐观更新。
    await loadState(id)
    return true
  }
  catch (error) {
    commitState.value = { key: `${id}:${key}`, ok: false, message: (error as Error).message }
    return false
  }
}

/**
 * 订阅探针的组件树推送（P6）：node 侧 sharedState 每次更新，面板整树跟随，
 * 并回读选中组件的状态——「小程序里改数据，面板毫秒级自动更新」的落点。
 * 返回退订函数。手动刷新仍是首载与兜底路径。
 */
export async function bindTreePush(): Promise<() => void> {
  return subscribeComponentTree((snapshot) => {
    pages.value = snapshot.pages
    fetchedAt.value = snapshot.fetchedAt
    treeError.value = null
    treeLoading.value = false
    const id = selectedId.value
    if (id)
      void loadState(id)
  })
}

export function isCommitting(id: string, key: string): boolean {
  return commitState.value?.key === `${id}:${key}` && !commitState.value.ok && commitState.value.message === undefined
}

export function commitMessage(id: string, key: string): string | undefined {
  return commitState.value?.key === `${id}:${key}` && !commitState.value.ok
    ? commitState.value.message
    : undefined
}

// ---------------------------------------------------------------- 只读暴露

export const inspector = {
  pages,
  treeLoading,
  treeError,
  fetchedAt,
  filterText,
  rows,
  selectedId,
  selectedNode,
  selectedState,
  stateLoading,
  stateError,
  refreshTree,
  /** 重新读取某个组件的状态（状态加载失败重试、写回后强刷都走这里）。 */
  reloadState: loadState,
  select,
  toggleExpand,
  setFilter,
  commitValue,
  isCommitting,
  commitMessage,
}

export type Inspector = typeof inspector

/** 强制让 `rows` 重算（mock 数据在 dev 下热替换时用得到）。 */
export function invalidateTree(): void {
  triggerRef(pages)
}
